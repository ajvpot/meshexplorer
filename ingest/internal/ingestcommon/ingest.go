package ingestcommon

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strconv"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	mqtt "github.com/eclipse/paho.mqtt.golang"
	"go.uber.org/zap"
)

type MQTTBrokerConfig struct {
	URL      string   `json:"url"`
	Username string   `json:"username"`
	Password string   `json:"password"`
	Topics   []string `json:"topics"`
}

// LoadMQTTBrokersFromEnv parses the MQTT_BROKERS environment variable, which must
// contain a JSON array of broker configs, e.g.:
//
//	[{"url":"tcp://host:1883","username":"u","password":"p","topics":["meshcore/#"]}]
//
// It returns an error when the variable is unset/empty or cannot be parsed so the
// daemon fails fast with a clear message rather than silently connecting to nothing.
// Brokers without an explicit topic list default to subscribing to "meshcore/#".
func LoadMQTTBrokersFromEnv() ([]MQTTBrokerConfig, error) {
	raw := os.Getenv("MQTT_BROKERS")
	if raw == "" {
		return nil, fmt.Errorf("MQTT_BROKERS is not set; provide a JSON array of broker configs (see .env.example)")
	}
	var brokers []MQTTBrokerConfig
	if err := json.Unmarshal([]byte(raw), &brokers); err != nil {
		return nil, fmt.Errorf("failed to parse MQTT_BROKERS as JSON: %w", err)
	}
	if len(brokers) == 0 {
		return nil, fmt.Errorf("MQTT_BROKERS contained no brokers")
	}
	for i := range brokers {
		if brokers[i].URL == "" {
			return nil, fmt.Errorf("MQTT_BROKERS[%d] is missing a url", i)
		}
		if len(brokers[i].Topics) == 0 {
			brokers[i].Topics = []string{"meshcore/#"}
		}
	}
	return brokers, nil
}

type Config struct {
	MQTTBrokers  []MQTTBrokerConfig `json:"mqtt_brokers"`
	MQTTClientID string             `json:"mqtt_client_id"`
	ClickHouse   struct {
		Host     string `json:"host"`
		Port     int    `json:"port"`
		Database string `json:"database"`
		Username string `json:"username"`
		Password string `json:"password"`
	} `json:"clickhouse"`
}

type MessageHandler func(client mqtt.Client, msg mqtt.Message, d *Daemon)

type Daemon struct {
	Config         *Config
	MQTTClients    []mqtt.Client
	BrokerStatus   map[string]bool
	CHConn         driver.Conn
	Ctx            context.Context
	Cancel         context.CancelFunc
	MessageHandler MessageHandler
}

func NewDaemon(config *Config, handler MessageHandler) *Daemon {
	ctx, cancel := context.WithCancel(context.Background())
	return &Daemon{
		Config:         config,
		BrokerStatus:   make(map[string]bool),
		Ctx:            ctx,
		Cancel:         cancel,
		MessageHandler: handler,
	}
}

func (d *Daemon) connectToBroker(broker MQTTBrokerConfig, maxRetries int) (mqtt.Client, error) {
	baseDelay := time.Second
	maxDelay := 30 * time.Second

	for attempt := 0; attempt <= maxRetries; attempt++ {
		opts := mqtt.NewClientOptions()
		opts.AddBroker(broker.URL)
		opts.SetClientID(fmt.Sprintf("%s-%d", d.Config.MQTTClientID, attempt))
		opts.SetDefaultPublishHandler(func(client mqtt.Client, msg mqtt.Message) {
			d.MessageHandler(client, msg, d)
		})
		opts.SetAutoReconnect(true)
		opts.SetConnectRetry(true)
		opts.SetConnectTimeout(10 * time.Second)
		opts.SetMaxReconnectInterval(30 * time.Second)
		opts.SetKeepAlive(30 * time.Second)
		opts.SetPingTimeout(10 * time.Second)
		opts.SetCleanSession(false)
		opts.SetResumeSubs(true)

		opts.SetOnConnectHandler(func(client mqtt.Client) {
			zap.L().Debug("Connected to MQTT broker", zap.String("broker", broker.URL))
		})
		opts.SetConnectionLostHandler(func(client mqtt.Client, err error) {
			zap.L().Warn("Connection lost to MQTT broker", zap.String("broker", broker.URL), zap.Error(err))
			d.BrokerStatus[broker.URL] = false
		})

		if broker.Username != "" {
			opts.SetUsername(broker.Username)
			if broker.Password != "" {
				opts.SetPassword(broker.Password)
			}
		}

		client := mqtt.NewClient(opts)
		if token := client.Connect(); token.Wait() && token.Error() != nil {
			zap.L().Warn("Failed to connect to MQTT broker",
				zap.String("broker", broker.URL),
				zap.Int("attempt", attempt+1),
				zap.Int("maxRetries", maxRetries+1),
				zap.Error(token.Error()))

			if attempt < maxRetries {
				delay := time.Duration(float64(baseDelay) * math.Pow(2, float64(attempt)))
				if delay > maxDelay {
					delay = maxDelay
				}
				zap.L().Debug("Retrying connection", zap.String("broker", broker.URL), zap.Duration("delay", delay))
				time.Sleep(delay)
				continue
			}
			return nil, fmt.Errorf("failed to connect to MQTT broker %s after %d attempts: %w", broker.URL, maxRetries+1, token.Error())
		}

		for _, topic := range broker.Topics {
			if token := client.Subscribe(topic, 0, nil); token.Wait() && token.Error() != nil {
				zap.L().Warn("Failed to subscribe to topic",
					zap.String("topic", topic),
					zap.String("broker", broker.URL),
					zap.Int("attempt", attempt+1),
					zap.Int("maxRetries", maxRetries+1),
					zap.Error(token.Error()))

				if attempt < maxRetries {
					client.Disconnect(250)
					delay := time.Duration(float64(baseDelay) * math.Pow(2, float64(attempt)))
					if delay > maxDelay {
						delay = maxDelay
					}
					zap.L().Debug("Retrying subscription", zap.String("broker", broker.URL), zap.Duration("delay", delay))
					time.Sleep(delay)
					continue
				}
				client.Disconnect(250)
				return nil, fmt.Errorf("failed to subscribe to topic %s on broker %s after %d attempts: %w", topic, broker.URL, maxRetries+1, token.Error())
			}
		}

		zap.L().Debug("Successfully connected to MQTT broker and subscribed to topics",
			zap.Strings("topics", broker.Topics),
			zap.String("broker", broker.URL))
		return client, nil
	}
	return nil, fmt.Errorf("unexpected error in connectToBroker for %s", broker.URL)
}

func (d *Daemon) ConnectMQTT() error {
	maxRetries := 5
	successfulConnections := 0
	totalBrokers := len(d.Config.MQTTBrokers)

	zap.L().Debug("Attempting to connect to MQTT brokers", zap.Int("totalBrokers", totalBrokers))

	for _, broker := range d.Config.MQTTBrokers {
		client, err := d.connectToBroker(broker, maxRetries)
		if err != nil {
			zap.L().Warn("Failed to connect to broker", zap.String("broker", broker.URL), zap.Error(err))
			d.BrokerStatus[broker.URL] = false
			continue
		}
		d.MQTTClients = append(d.MQTTClients, client)
		d.BrokerStatus[broker.URL] = true
		successfulConnections++
	}

	if successfulConnections == 0 {
		return fmt.Errorf("failed to connect to any MQTT brokers")
	}

	zap.L().Debug("Successfully connected to MQTT brokers",
		zap.Int("successfulConnections", successfulConnections),
		zap.Int("totalBrokers", totalBrokers))
	return nil
}

func (d *Daemon) ConnectClickHouse() error {
	settings := clickhouse.Settings{
		"max_execution_time":            60,
		"async_insert":                  1,
		"wait_for_async_insert":         1,
		"async_insert_busy_timeout_ms":  2500,    // 2.5 seconds - flush if buffer is busy for this long
		"async_insert_max_data_size":    1048576, // 1MB - flush when buffer reaches this size
		"async_insert_max_query_number": 5000,    // flush after this many insert queries accumulate
	}

	conn, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{fmt.Sprintf("%s:%d", d.Config.ClickHouse.Host, d.Config.ClickHouse.Port)},
		Auth: clickhouse.Auth{
			Database: d.Config.ClickHouse.Database,
			Username: d.Config.ClickHouse.Username,
			Password: d.Config.ClickHouse.Password,
		},
		Settings: settings,
		Debug:    false,
	})
	if err != nil {
		return fmt.Errorf("failed to connect to ClickHouse: %w", err)
	}
	d.CHConn = conn
	zap.L().Info("Connected to ClickHouse",
		zap.String("host", d.Config.ClickHouse.Host),
		zap.Int("port", d.Config.ClickHouse.Port),
		zap.Reflect("settings", settings))
	return nil
}

func (d *Daemon) MonitorConnections() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-d.Ctx.Done():
			return
		case <-ticker.C:
			d.checkAndReconnectBrokers()
		}
	}
}

func (d *Daemon) checkAndReconnectBrokers() {
	for i, broker := range d.Config.MQTTBrokers {
		if i >= len(d.MQTTClients) {
			client, err := d.connectToBroker(broker, 3)
			if err != nil {
				zap.L().Warn("Background reconnection failed for broker", zap.String("broker", broker.URL), zap.Error(err))
				continue
			}
			d.MQTTClients = append(d.MQTTClients, client)
			d.BrokerStatus[broker.URL] = true
			zap.L().Debug("Successfully reconnected to broker", zap.String("broker", broker.URL))
			continue
		}
		client := d.MQTTClients[i]
		if client == nil {
			newClient, err := d.connectToBroker(broker, 3)
			if err != nil {
				zap.L().Warn("Background reconnection failed for broker", zap.String("broker", broker.URL), zap.Error(err))
				d.BrokerStatus[broker.URL] = false
				continue
			}
			d.MQTTClients[i] = newClient
			d.BrokerStatus[broker.URL] = true
			zap.L().Debug("Successfully reconnected to broker", zap.String("broker", broker.URL))
			continue
		}
		if !client.IsConnected() {
			d.BrokerStatus[broker.URL] = false
			newClient, err := d.connectToBroker(broker, 3)
			if err != nil {
				zap.L().Warn("Background reconnection failed for broker", zap.String("broker", broker.URL), zap.Error(err))
				continue
			}
			d.MQTTClients[i] = newClient
			d.BrokerStatus[broker.URL] = true
			zap.L().Debug("Successfully reconnected to broker", zap.String("broker", broker.URL))
		} else {
			d.BrokerStatus[broker.URL] = true
		}
	}
}

func GetEnvOrDefault(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func GetEnvIntOrDefault(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}
