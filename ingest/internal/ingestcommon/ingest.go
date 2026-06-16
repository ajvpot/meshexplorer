package ingestcommon

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"strconv"
	"sync"
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

	// mu guards BrokerStatus and lastActivity, which are read/written from both
	// the connection-monitor goroutine and paho's callback goroutines.
	mu           sync.Mutex
	lastActivity map[string]time.Time
	staleAfter   time.Duration
}

func NewDaemon(config *Config, handler MessageHandler) *Daemon {
	ctx, cancel := context.WithCancel(context.Background())
	return &Daemon{
		Config:         config,
		BrokerStatus:   make(map[string]bool),
		Ctx:            ctx,
		Cancel:         cancel,
		MessageHandler: handler,
		lastActivity:   make(map[string]time.Time),
		staleAfter:     time.Duration(GetEnvIntOrDefault("MQTT_STALE_AFTER_SECONDS", 300)) * time.Second,
	}
}

// recordActivity resets a broker's liveness clock. Called on every received
// message and on every (re)connect.
func (d *Daemon) recordActivity(brokerURL string) {
	d.mu.Lock()
	d.lastActivity[brokerURL] = time.Now()
	d.mu.Unlock()
}

// isStale reports whether a broker has produced no traffic within the staleness
// window. A client that reports connected but is nonetheless stale is a zombie
// (connected but no longer delivering messages) — the failure the watchdog in
// checkAndReconnectBrokers exists to recover from.
func (d *Daemon) isStale(brokerURL string) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	last, ok := d.lastActivity[brokerURL]
	if !ok {
		return false
	}
	return time.Since(last) > d.staleAfter
}

func (d *Daemon) setBrokerStatus(brokerURL string, up bool) {
	d.mu.Lock()
	d.BrokerStatus[brokerURL] = up
	d.mu.Unlock()
}

func (d *Daemon) connectToBroker(broker MQTTBrokerConfig, idx int, maxRetries int) (mqtt.Client, error) {
	baseDelay := time.Second
	maxDelay := 30 * time.Second

	for attempt := 0; attempt <= maxRetries; attempt++ {
		opts := mqtt.NewClientOptions()
		opts.AddBroker(broker.URL)
		// Stable, per-broker client ID so reconnects and forced rebuilds reuse the
		// same MQTT session identity rather than spawning a "-0" client that races
		// the one paho is already auto-reconnecting.
		opts.SetClientID(fmt.Sprintf("%s-%d", d.Config.MQTTClientID, idx))
		opts.SetDefaultPublishHandler(func(client mqtt.Client, msg mqtt.Message) {
			// Any received message proves the subscription is live; record it so the
			// staleness watchdog can distinguish a healthy connection from a zombie.
			d.recordActivity(broker.URL)
			d.MessageHandler(client, msg, d)
		})
		opts.SetAutoReconnect(true)
		opts.SetConnectRetry(true)
		opts.SetConnectTimeout(10 * time.Second)
		opts.SetMaxReconnectInterval(30 * time.Second)
		// As a near-silent subscriber we send a PINGREQ roughly every KeepAlive
		// seconds; lowering it keeps the Cloudflare WebSocket path warm in the
		// client->server direction (a lever for the residual mid-stream stalls).
		opts.SetKeepAlive(time.Duration(GetEnvIntOrDefault("MQTT_KEEPALIVE_SECONDS", 30)) * time.Second)
		// Allow extra margin for PINGRESP to survive the Cloudflare WebSocket
		// proxy's buffering/jitter; 10s was tight and produced false
		// "pingresp not received" disconnects. Configurable for tuning.
		opts.SetPingTimeout(time.Duration(GetEnvIntOrDefault("MQTT_PING_TIMEOUT_SECONDS", 20)) * time.Second)
		// Start a fresh session on every (re)connect and resubscribe explicitly in
		// the OnConnect handler below. This avoids depending on broker-side session
		// persistence — which is exactly what left the client connected-but-
		// unsubscribed (a zombie, ingesting nothing) after the upstream broker was
		// replaced.
		opts.SetCleanSession(true)
		opts.SetResumeSubs(false)

		opts.SetOnConnectHandler(func(client mqtt.Client) {
			zap.L().Info("Connected to MQTT broker", zap.String("broker", broker.URL))
			// Reset the staleness clock and (re)subscribe on every connect, including
			// paho's automatic reconnects, so a reconnect always restores delivery.
			d.recordActivity(broker.URL)
			d.setBrokerStatus(broker.URL, true)
			for _, topic := range broker.Topics {
				if token := client.Subscribe(topic, 0, nil); token.Wait() && token.Error() != nil {
					zap.L().Warn("Failed to subscribe to topic",
						zap.String("topic", topic),
						zap.String("broker", broker.URL),
						zap.Error(token.Error()))
				} else {
					zap.L().Info("Subscribed to topic",
						zap.String("topic", topic),
						zap.String("broker", broker.URL))
				}
			}
		})
		opts.SetConnectionLostHandler(func(client mqtt.Client, err error) {
			zap.L().Warn("Connection lost to MQTT broker", zap.String("broker", broker.URL), zap.Error(err))
			d.setBrokerStatus(broker.URL, false)
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

		// Subscriptions are established in the OnConnect handler so they are
		// re-established on every reconnect, not just on this initial connect.
		// Seed the liveness clock so a brand-new connection gets a full staleness
		// window before the watchdog can judge it.
		d.recordActivity(broker.URL)
		return client, nil
	}
	return nil, fmt.Errorf("unexpected error in connectToBroker for %s", broker.URL)
}

func (d *Daemon) ConnectMQTT() error {
	maxRetries := 5
	successfulConnections := 0
	totalBrokers := len(d.Config.MQTTBrokers)

	zap.L().Debug("Attempting to connect to MQTT brokers", zap.Int("totalBrokers", totalBrokers))

	// Pre-size MQTTClients so each slot stays aligned with its broker index even
	// when some brokers fail to connect (a failed broker leaves a nil slot that the
	// monitor retries). The old append-only approach misaligned indices whenever an
	// earlier broker failed.
	d.MQTTClients = make([]mqtt.Client, totalBrokers)

	for i, broker := range d.Config.MQTTBrokers {
		client, err := d.connectToBroker(broker, i, maxRetries)
		if err != nil {
			zap.L().Warn("Failed to connect to broker", zap.String("broker", broker.URL), zap.Error(err))
			d.setBrokerStatus(broker.URL, false)
			continue
		}
		d.MQTTClients[i] = client
		d.setBrokerStatus(broker.URL, true)
		successfulConnections++
	}

	if successfulConnections == 0 {
		return fmt.Errorf("failed to connect to any MQTT brokers")
	}

	zap.L().Info("Connected to MQTT brokers",
		zap.Int("successfulConnections", successfulConnections),
		zap.Int("totalBrokers", totalBrokers),
		zap.Duration("staleAfter", d.staleAfter))
	return nil
}

func (d *Daemon) ConnectClickHouse() error {
	// The ingest path now batches rows application-side (see meshcoreingest's
	// batch writer), so each insert is already a large native block. Server-side
	// async_insert buffering on top of that adds latency without benefit, so it
	// is left off (default 0).
	settings := clickhouse.Settings{
		"max_execution_time": 60,
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

// checkAndReconnectBrokers is a watchdog, not the primary reconnection path.
// paho's auto-reconnect handles transient drops and the OnConnect handler
// resubscribes, so this only intervenes to (a) (re)establish brokers that have no
// live client and (b) tear down zombie connections — clients that report connected
// but have gone silent past the staleness window (e.g. after an upstream broker
// swap dropped the subscription). Forcing a full rebuild gets a fresh session and
// resubscribe, which is what actually restores delivery.
func (d *Daemon) checkAndReconnectBrokers() {
	for i, broker := range d.Config.MQTTBrokers {
		client := d.MQTTClients[i]

		if client == nil {
			newClient, err := d.connectToBroker(broker, i, 3)
			if err != nil {
				zap.L().Warn("Background reconnection failed for broker", zap.String("broker", broker.URL), zap.Error(err))
				d.setBrokerStatus(broker.URL, false)
				continue
			}
			d.MQTTClients[i] = newClient
			d.setBrokerStatus(broker.URL, true)
			zap.L().Info("Established connection to broker", zap.String("broker", broker.URL))
			continue
		}

		if d.isStale(broker.URL) {
			zap.L().Warn("No messages received within staleness window; forcing reconnect",
				zap.String("broker", broker.URL),
				zap.Bool("reportedConnected", client.IsConnected()),
				zap.Duration("staleAfter", d.staleAfter))
			// Explicitly disconnect so the old client stops auto-reconnecting and
			// does not race the replacement under the same client ID.
			client.Disconnect(250)
			d.setBrokerStatus(broker.URL, false)
			newClient, err := d.connectToBroker(broker, i, 3)
			if err != nil {
				zap.L().Warn("Forced reconnection failed for broker", zap.String("broker", broker.URL), zap.Error(err))
				d.MQTTClients[i] = nil
				continue
			}
			d.MQTTClients[i] = newClient
			d.recordActivity(broker.URL)
			d.setBrokerStatus(broker.URL, true)
			continue
		}

		d.setBrokerStatus(broker.URL, client.IsConnected())
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
