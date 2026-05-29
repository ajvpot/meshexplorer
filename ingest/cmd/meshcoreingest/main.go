package main

import (
	"encoding/hex"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/ClickHouse/ch-go/proto"
	"github.com/ajvpot/clickhouse-meshingest/internal/ingestcommon"
	mqtt "github.com/eclipse/paho.mqtt.golang"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func parseMeshCoreRawMessage(payload []byte) (origin string, originPubkey []byte, meshTimestamp time.Time, packet []byte, err error) {
	type RawPacket struct {
		Origin    string `json:"origin"`
		OriginID  string `json:"origin_id"`
		Timestamp string `json:"timestamp"`
		Type      string `json:"type"`
		Data      string `json:"data"`
	}
	var pkt RawPacket
	if err = json.Unmarshal(payload, &pkt); err != nil {
		return "", nil, time.Time{}, nil, err
	}
	packet, err = hex.DecodeString(pkt.Data)
	if err != nil {
		return "", nil, time.Time{}, nil, err
	}

	// Clean origin and origin_id by removing carriage returns and newlines
	cleanOrigin := strings.ReplaceAll(strings.ReplaceAll(pkt.Origin, "\r", ""), "\n", "")
	cleanOriginID := strings.ReplaceAll(strings.ReplaceAll(pkt.OriginID, "\r", ""), "\n", "")

	// Decode origin_id hex to binary bytes for compact storage
	var originPubkeyBytes []byte
	if cleanOriginID != "" {
		if decoded, decErr := hex.DecodeString(cleanOriginID); decErr == nil {
			originPubkeyBytes = decoded
		} else {
			originPubkeyBytes = []byte(cleanOriginID)
		}
	}
	ts := pkt.Timestamp
	if len(ts) > 0 && ts[len(ts)-1] != 'Z' && !strings.ContainsAny(ts[len(ts)-6:], "+-") {
		ts = ts + "Z"
	}
	meshTimestamp, err = time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		return "", nil, time.Time{}, nil, err
	}
	return cleanOrigin, originPubkeyBytes, meshTimestamp, packet, nil
}

func parseMeshCorePacketsMessage(payload []byte) (origin string, originPubkey []byte, meshTimestamp time.Time, packet []byte, err error) {
	type PacketMessage struct {
		Origin     string `json:"origin"`
		OriginID   string `json:"origin_id"`
		Timestamp  string `json:"timestamp"`
		Type       string `json:"type"`
		Direction  string `json:"direction"`
		Time       string `json:"time"`
		Date       string `json:"date"`
		Len        string `json:"len"`
		PacketType string `json:"packet_type"`
		Route      string `json:"route"`
		PayloadLen string `json:"payload_len"`
		Raw        string `json:"raw"`
		SNR        string `json:"SNR"`
		RSSI       string `json:"RSSI"`
		Score      string `json:"score"`
		Duration   string `json:"duration"`
		Hash       string `json:"hash"`
	}
	var pkt PacketMessage
	if err = json.Unmarshal(payload, &pkt); err != nil {
		return "", nil, time.Time{}, nil, err
	}

	// Decode the raw hex packet data
	packet, err = hex.DecodeString(pkt.Raw)
	if err != nil {
		return "", nil, time.Time{}, nil, err
	}

	// Clean origin and origin_id by removing carriage returns and newlines
	cleanOrigin := strings.ReplaceAll(strings.ReplaceAll(pkt.Origin, "\r", ""), "\n", "")
	cleanOriginID := strings.ReplaceAll(strings.ReplaceAll(pkt.OriginID, "\r", ""), "\n", "")

	// Decode origin_id hex to binary bytes for compact storage
	var originPubkeyBytes []byte
	if cleanOriginID != "" {
		if decoded, decErr := hex.DecodeString(cleanOriginID); decErr == nil {
			originPubkeyBytes = decoded
		} else {
			originPubkeyBytes = []byte(cleanOriginID)
		}
	}

	// Parse timestamp
	ts := pkt.Timestamp
	if len(ts) > 0 && ts[len(ts)-1] != 'Z' && !strings.ContainsAny(ts[len(ts)-6:], "+-") {
		ts = ts + "Z"
	}
	meshTimestamp, err = time.Parse(time.RFC3339Nano, ts)
	if err != nil {
		return "", nil, time.Time{}, nil, err
	}

	return cleanOrigin, originPubkeyBytes, meshTimestamp, packet, nil
}

// extractBaseTopic extracts the base topic from a full MQTT topic path
// For topics like:
// - meshcore/raw -> returns "meshcore"
// - meshcore/salish/raw -> returns "meshcore/salish"
// - meshcore/salish/a/raw -> returns "meshcore/salish/a"
// - meshcore/salish/a/b/raw -> returns "meshcore/salish/a/b"
// - meshcore/binary/[gatewayId] -> returns "meshcore"
// - meshcore/salish/binary/[gatewayId] -> returns "meshcore/salish"
// - meshcore/packets -> returns "meshcore"
// - meshcore/salish/packets -> returns "meshcore/salish"
// - meshcore/SEA/[gatewayId]/packets -> returns "meshcore/SEA"
func extractBaseTopic(topic string) string {
	topicParts := strings.Split(topic, "/")

	if len(topicParts) < 2 {
		return topic
	}

	// Check if it's a binary topic (last 2 parts are "binary" and gateway ID)
	if len(topicParts) >= 3 && topicParts[len(topicParts)-2] == "binary" {
		// Remove the last 2 parts: "binary" and "[gatewayId]"
		return strings.Join(topicParts[:len(topicParts)-2], "/")
	}

	// Check if it's a raw topic (last part is "raw")
	if topicParts[len(topicParts)-1] == "raw" {
		// Remove the last 1 part: "raw"
		return strings.Join(topicParts[:len(topicParts)-1], "/")
	}

	// Check if it's a packets topic with gateway ID (last part is "packets" and second-to-last looks like a gateway ID)
	if len(topicParts) >= 4 && topicParts[len(topicParts)-1] == "packets" {
		gatewayID := topicParts[len(topicParts)-2]
		// If the second-to-last part is a long hex string (likely a gateway ID), remove both parts
		if len(gatewayID) >= 40 && isHexString(gatewayID) {
			// Remove the last 2 parts: "[gatewayId]" and "packets"
			return strings.Join(topicParts[:len(topicParts)-2], "/")
		}
	}

	// Check if it's a packets topic (last part is "packets")
	if topicParts[len(topicParts)-1] == "packets" {
		// Remove the last 1 part: "packets"
		return strings.Join(topicParts[:len(topicParts)-1], "/")
	}

	// Fallback: if no "raw", "binary", or "packets" pattern found, return the first part
	return topicParts[0]
}

// isHexString checks if a string contains only hexadecimal characters
func isHexString(s string) bool {
	for _, c := range s {
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

func handleMeshCoreMessage(client mqtt.Client, msg mqtt.Message, d *ingestcommon.Daemon) {
	broker := ""
	clientOptions := client.OptionsReader()
	if servers := clientOptions.Servers(); len(servers) > 0 {
		broker = servers[0].String()
	}

	if broker == "tcp://mqtt-internal:1883" {
		broker = "tcp://mqtt.w0z.is:1883"
	}

	zap.L().Debug("Received MeshCore packet", zap.String("topic", msg.Topic()), zap.String("broker", broker))

	// Split topic once for efficient processing
	topicParts := strings.Split(msg.Topic(), "/")

	// Extract base topic (e.g., meshcore, meshcore/salish, meshcore/salish/a, etc.)
	// This ensures we store only the base topic in the database, not the full topic path
	baseTopic := extractBaseTopic(msg.Topic())

	startTime := time.Now()

	// Handle meshcore/raw and meshcore/*/raw topics (including multi-level paths like meshcore/salish/a/raw)
	if len(topicParts) >= 2 && topicParts[len(topicParts)-1] == "raw" {
		origin, originPubkey, meshTimestamp, decoded, err := parseMeshCoreRawMessage(msg.Payload())
		if err != nil {
			zap.L().Warn("Failed to parse meshcore/*/raw message", zap.Error(err))
			return
		}
		query := `INSERT INTO meshcore_packets (ingest_timestamp, origin, origin_pubkey, broker, topic, mesh_timestamp, packet) VALUES (?, ?, ?, ?, ?, ?, ?)`
		ingestTime := time.Now()
		err = d.CHConn.Exec(d.Ctx, query, proto.ToDateTime64(ingestTime, proto.PrecisionMilli), origin, string(originPubkey), broker, baseTopic, meshTimestamp, string(decoded))
		if err != nil {
			zap.L().Warn("Failed to insert MeshCore packet into ClickHouse", zap.Error(err))
			return
		}
		zap.L().Info("Successfully ingested MeshCore RAW packet", zap.String("broker", broker), zap.String("topic", baseTopic), zap.Duration("duration", time.Since(startTime)))
		return
	}

	// Handle meshcore/*/[gatewayId]/packets topics (e.g., meshcore/SEA/[gatewayId]/packets)
	if len(topicParts) >= 4 && topicParts[len(topicParts)-1] == "packets" {
		gatewayID := topicParts[len(topicParts)-2]
		// Check if the second-to-last part is a gateway ID (long hex string)
		if len(gatewayID) >= 40 && isHexString(gatewayID) {
			origin, originPubkey, meshTimestamp, decoded, err := parseMeshCorePacketsMessage(msg.Payload())
			if err != nil {
				zap.L().Warn("Failed to parse meshcore/*/[gatewayId]/packets message", zap.Error(err))
				return
			}
			query := `INSERT INTO meshcore_packets (ingest_timestamp, origin, origin_pubkey, broker, topic, mesh_timestamp, packet) VALUES (?, ?, ?, ?, ?, ?, ?)`
			ingestTime := time.Now()
			err = d.CHConn.Exec(d.Ctx, query, proto.ToDateTime64(ingestTime, proto.PrecisionMilli), origin, string(originPubkey), broker, baseTopic, meshTimestamp, string(decoded))
			if err != nil {
				zap.L().Warn("Failed to insert MeshCore packet into ClickHouse", zap.Error(err))
				return
			}
			zap.L().Info("Successfully ingested MeshCore PACKETS packet (with gateway ID)", zap.String("broker", broker), zap.String("topic", baseTopic), zap.String("gatewayID", gatewayID), zap.Duration("duration", time.Since(startTime)))
			return
		}
	}

	// Handle meshcore/packets and meshcore/*/packets topics (including multi-level paths)
	if len(topicParts) >= 2 && topicParts[len(topicParts)-1] == "packets" {
		origin, originPubkey, meshTimestamp, decoded, err := parseMeshCorePacketsMessage(msg.Payload())
		if err != nil {
			zap.L().Warn("Failed to parse meshcore/*/packets message", zap.Error(err))
			return
		}
		query := `INSERT INTO meshcore_packets (ingest_timestamp, origin, origin_pubkey, broker, topic, mesh_timestamp, packet) VALUES (?, ?, ?, ?, ?, ?, ?)`
		ingestTime := time.Now()
		err = d.CHConn.Exec(d.Ctx, query, proto.ToDateTime64(ingestTime, proto.PrecisionMilli), origin, string(originPubkey), broker, baseTopic, meshTimestamp, string(decoded))
		if err != nil {
			zap.L().Warn("Failed to insert MeshCore packet into ClickHouse", zap.Error(err))
			return
		}
		zap.L().Info("Successfully ingested MeshCore PACKETS packet", zap.String("broker", broker), zap.String("topic", baseTopic), zap.Duration("duration", time.Since(startTime)))
		return
	}

	// Handle meshcore/*/binary/[gatewayid] topics (including multi-level paths)
	if len(topicParts) >= 3 && topicParts[len(topicParts)-2] == "binary" {
		// Extract gateway ID from the last part of the topic
		gatewayID := topicParts[len(topicParts)-1]
		// Decode gatewayID hex to binary bytes for compact storage; fall back to raw bytes on error
		originPubkeyBytes, decErr := hex.DecodeString(gatewayID)
		if decErr != nil {
			originPubkeyBytes = []byte{}
		}

		query := `INSERT INTO meshcore_packets (ingest_timestamp, origin, origin_pubkey, broker, topic, mesh_timestamp, packet) VALUES (?, ?, ?, ?, ?, ?, ?)`
		ingestTime := time.Now()
		err := d.CHConn.Exec(d.Ctx, query, proto.ToDateTime64(ingestTime, proto.PrecisionMilli), gatewayID, string(originPubkeyBytes), broker, baseTopic, time.Time{}, string(msg.Payload()))
		if err != nil {
			zap.L().Warn("Failed to insert MeshCore binary packet into ClickHouse", zap.Error(err))
			return
		}
		zap.L().Info("Successfully ingested MeshCore BINARY packet", zap.String("broker", broker), zap.String("topic", baseTopic), zap.String("gatewayID", gatewayID), zap.Duration("duration", time.Since(startTime)))
		return
	}
}

func loadConfig() (*ingestcommon.Config, error) {
	brokers, err := ingestcommon.LoadMQTTBrokersFromEnv()
	if err != nil {
		return nil, err
	}
	config := &ingestcommon.Config{
		MQTTBrokers:  brokers,
		MQTTClientID: ingestcommon.GetEnvOrDefault("MQTT_CLIENT_ID", "meshcore-ingest"),
	}
	config.ClickHouse.Host = ingestcommon.GetEnvOrDefault("CLICKHOUSE_HOST", "127.0.0.1")
	config.ClickHouse.Port = ingestcommon.GetEnvIntOrDefault("CLICKHOUSE_PORT", 9000)
	config.ClickHouse.Database = ingestcommon.GetEnvOrDefault("CLICKHOUSE_DB", "default")
	config.ClickHouse.Username = ingestcommon.GetEnvOrDefault("CLICKHOUSE_USER", "default")
	config.ClickHouse.Password = ingestcommon.GetEnvOrDefault("CLICKHOUSE_PASSWORD", "")
	return config, nil
}

func main() {
	zapConfig := zap.NewProductionConfig()
	zapConfig.Level = zap.NewAtomicLevelAt(zap.InfoLevel)
	zapConfig.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	logger, err := zapConfig.Build()
	if err != nil {
		log.Fatalf("Failed to initialize logger: %v", err)
	}
	defer logger.Sync()
	zap.ReplaceGlobals(logger)
	config, err := loadConfig()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}
	daemon := ingestcommon.NewDaemon(config, handleMeshCoreMessage)
	if err := daemon.ConnectClickHouse(); err != nil {
		log.Fatalf("Failed to connect to ClickHouse: %v", err)
	}
	defer daemon.CHConn.Close()
	if err := daemon.ConnectMQTT(); err != nil {
		log.Fatalf("Failed to connect to MQTT brokers: %v", err)
	}
	defer func() {
		for _, client := range daemon.MQTTClients {
			if client != nil {
				client.Disconnect(250)
			}
		}
	}()
	go daemon.MonitorConnections()
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	zap.L().Info("MeshCore ingest daemon started. Press Ctrl+C to stop.")
	<-sigChan
	zap.L().Info("Shutting down daemon...")
	daemon.Cancel()
}
