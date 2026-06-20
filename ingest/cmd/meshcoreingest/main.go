package main

import (
	"encoding/hex"
	"encoding/json"
	"log"
	"os"
	"os/signal"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/ajvpot/meshexplorer/ingest/internal/ingestcommon"
	mqtt "github.com/eclipse/paho.mqtt.golang"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// meshcorePacketRow is one buffered row destined for the meshcore_packets
// table. The MQTT handler builds these and enqueues them; a single background
// goroutine batches and inserts them. Keeping the per-message work to an
// in-memory enqueue is what stops paho's inbound goroutine from blocking on
// ClickHouse (a slow synchronous insert there starves PINGRESP handling and
// makes the connection flap).
type meshcorePacketRow struct {
	ingestTime    time.Time
	origin        string
	originPubkey  string
	broker        string
	topic         string
	meshTimestamp time.Time
	packet        string
}

// Defaults for the batch writer, overridable via the env vars read in main:
//   - MESHCORE_BATCH_FLUSH_SECONDS: flush at least this often (small batches).
//   - MESHCORE_BATCH_MAX_ROWS: flush early once a batch reaches this many rows
//     so bursts don't sit in memory for the full interval.
//   - MESHCORE_BATCH_BUFFER: producer/consumer channel buffer; sized for many
//     seconds of headroom at peak so enqueues effectively never drop unless
//     ClickHouse is unavailable for an extended period.
const (
	defaultBatchFlushSeconds = 10
	defaultBatchMaxRows      = 5000
	defaultBatchBuffer       = 50000
)

// packetRows carries decoded rows from the MQTT handler to the batch writer. It
// is created in main once the configured buffer size is known.
var packetRows chan meshcorePacketRow

// droppedRows counts rows dropped because the buffer was full (ClickHouse stuck
// or unreachable). The writer logs and resets it on each flush.
var droppedRows uint64

// droppedEmpty counts rows dropped because the decoded packet was empty. A
// growing number of upstream publishers emit an otherwise-valid envelope
// (origin/origin_id present) with no packet bytes; storing those produces rows
// that decode to an empty payload and a degenerate packet_hash and carry no
// signal. The writer logs and resets this on each flush.
var droppedEmpty uint64

// enqueuePacket hands a row to the batch writer without ever blocking the
// caller. Blocking here would defeat the whole purpose — it runs on paho's
// inbound goroutine. If the buffer is full we drop and count instead.
func enqueuePacket(row meshcorePacketRow) {
	// Skip envelopes that carry no packet bytes: there is nothing to decode and
	// they only add noise (empty payload, degenerate hash). Counted, not stored.
	if len(row.packet) == 0 {
		atomic.AddUint64(&droppedEmpty, 1)
		return
	}
	select {
	case packetRows <- row:
	default:
		atomic.AddUint64(&droppedRows, 1)
	}
}

// runBatchWriter drains packetRows, accumulating rows and flushing them to
// ClickHouse in a single batched insert whenever the batch reaches maxRows or
// flushInterval elapses. It exits after draining and flushing any remaining
// rows once the daemon context is cancelled.
func runBatchWriter(d *ingestcommon.Daemon, flushInterval time.Duration, maxRows int) {
	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	batch := make([]meshcorePacketRow, 0, maxRows)
	flush := func() {
		if dropped := atomic.SwapUint64(&droppedRows, 0); dropped > 0 {
			zap.L().Warn("Dropped MeshCore packets: insert buffer full", zap.Uint64("dropped", dropped))
		}
		if dropped := atomic.SwapUint64(&droppedEmpty, 0); dropped > 0 {
			zap.L().Info("Dropped MeshCore packets: empty packet (no bytes to decode)", zap.Uint64("dropped", dropped))
		}
		if len(batch) == 0 {
			return
		}
		if err := insertPacketBatch(d, batch); err != nil {
			zap.L().Warn("Failed to insert MeshCore packet batch into ClickHouse", zap.Int("rows", len(batch)), zap.Error(err))
		} else {
			zap.L().Info("Inserted MeshCore packet batch", zap.Int("rows", len(batch)))
		}
		batch = batch[:0]
	}

	for {
		select {
		case <-d.Ctx.Done():
			// Drain whatever is already buffered before exiting so a clean
			// shutdown doesn't lose the last partial batch.
			for {
				select {
				case row := <-packetRows:
					batch = append(batch, row)
					if len(batch) >= maxRows {
						flush()
					}
				default:
					flush()
					return
				}
			}
		case row := <-packetRows:
			batch = append(batch, row)
			if len(batch) >= maxRows {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

// insertPacketBatch writes a batch of rows to meshcore_packets in one native
// insert. ClickHouse commits a native block atomically (no per-row partial
// success), so on failure the whole batch is dropped and the next flush simply
// carries on. time.Time is appended directly for the DateTime64 columns; the
// driver scales to each column's precision.
func insertPacketBatch(d *ingestcommon.Daemon, rows []meshcorePacketRow) error {
	batch, err := d.CHConn.PrepareBatch(d.Ctx, "INSERT INTO meshcore_packets (ingest_timestamp, origin, origin_pubkey, broker, topic, mesh_timestamp, packet)")
	if err != nil {
		return err
	}
	for _, r := range rows {
		if err := batch.Append(r.ingestTime, r.origin, r.originPubkey, r.broker, r.topic, r.meshTimestamp, r.packet); err != nil {
			_ = batch.Abort()
			return err
		}
	}
	return batch.Send()
}

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

// flexString unmarshals a JSON value that may be encoded as either a string or
// a number into a string. Depending on gateway firmware, the numeric metric
// fields below — SNR, len, etc. — arrive as JSON numbers (including negative
// and fractional values) rather than strings; without this, a single numeric
// field would fail the whole packet's unmarshal and drop the message, including
// the raw packet bytes we actually need.
type flexString string

func (f *flexString) UnmarshalJSON(data []byte) error {
	if len(data) == 0 || string(data) == "null" {
		*f = ""
		return nil
	}
	if data[0] == '"' {
		var s string
		if err := json.Unmarshal(data, &s); err != nil {
			return err
		}
		*f = flexString(s)
		return nil
	}
	// Non-string (number, bool): keep the raw JSON token as its text form.
	*f = flexString(data)
	return nil
}

func parseMeshCorePacketsMessage(payload []byte) (origin string, originPubkey []byte, meshTimestamp time.Time, packet []byte, err error) {
	type PacketMessage struct {
		Origin     string     `json:"origin"`
		OriginID   string     `json:"origin_id"`
		Timestamp  string     `json:"timestamp"`
		Type       string     `json:"type"`
		Direction  string     `json:"direction"`
		Time       string     `json:"time"`
		Date       string     `json:"date"`
		Len        flexString `json:"len"`
		PacketType flexString `json:"packet_type"`
		Route      string     `json:"route"`
		PayloadLen flexString `json:"payload_len"`
		Raw        string     `json:"raw"`
		SNR        flexString `json:"SNR"`
		RSSI       flexString `json:"RSSI"`
		Score      flexString `json:"score"`
		Duration   flexString `json:"duration"`
		Hash       string     `json:"hash"`
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

	// Handle meshcore/raw and meshcore/*/raw topics (including multi-level paths like meshcore/salish/a/raw)
	if len(topicParts) >= 2 && topicParts[len(topicParts)-1] == "raw" {
		origin, originPubkey, meshTimestamp, decoded, err := parseMeshCoreRawMessage(msg.Payload())
		if err != nil {
			zap.L().Warn("Failed to parse meshcore/*/raw message", zap.Error(err))
			return
		}
		enqueuePacket(meshcorePacketRow{
			ingestTime:    time.Now(),
			origin:        origin,
			originPubkey:  string(originPubkey),
			broker:        broker,
			topic:         baseTopic,
			meshTimestamp: meshTimestamp,
			packet:        string(decoded),
		})
		zap.L().Debug("Enqueued MeshCore RAW packet", zap.String("broker", broker), zap.String("topic", baseTopic))
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
			enqueuePacket(meshcorePacketRow{
				ingestTime:    time.Now(),
				origin:        origin,
				originPubkey:  string(originPubkey),
				broker:        broker,
				topic:         baseTopic,
				meshTimestamp: meshTimestamp,
				packet:        string(decoded),
			})
			zap.L().Debug("Enqueued MeshCore PACKETS packet (with gateway ID)", zap.String("broker", broker), zap.String("topic", baseTopic), zap.String("gatewayID", gatewayID))
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
		enqueuePacket(meshcorePacketRow{
			ingestTime:    time.Now(),
			origin:        origin,
			originPubkey:  string(originPubkey),
			broker:        broker,
			topic:         baseTopic,
			meshTimestamp: meshTimestamp,
			packet:        string(decoded),
		})
		zap.L().Debug("Enqueued MeshCore PACKETS packet", zap.String("broker", broker), zap.String("topic", baseTopic))
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

		enqueuePacket(meshcorePacketRow{
			ingestTime:    time.Now(),
			origin:        gatewayID,
			originPubkey:  string(originPubkeyBytes),
			broker:        broker,
			topic:         baseTopic,
			meshTimestamp: time.Time{},
			packet:        string(msg.Payload()),
		})
		zap.L().Debug("Enqueued MeshCore BINARY packet", zap.String("broker", broker), zap.String("topic", baseTopic), zap.String("gatewayID", gatewayID))
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
	// Start the batch writer before connecting to MQTT so the consumer is
	// draining the buffer the moment the first messages arrive.
	flushInterval := time.Duration(ingestcommon.GetEnvIntOrDefault("MESHCORE_BATCH_FLUSH_SECONDS", defaultBatchFlushSeconds)) * time.Second
	maxRows := ingestcommon.GetEnvIntOrDefault("MESHCORE_BATCH_MAX_ROWS", defaultBatchMaxRows)
	bufSize := ingestcommon.GetEnvIntOrDefault("MESHCORE_BATCH_BUFFER", defaultBatchBuffer)
	packetRows = make(chan meshcorePacketRow, bufSize)
	zap.L().Info("Starting MeshCore batch writer",
		zap.Duration("flushInterval", flushInterval),
		zap.Int("maxRows", maxRows),
		zap.Int("buffer", bufSize))
	go runBatchWriter(daemon, flushInterval, maxRows)
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
