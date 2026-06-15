-- +goose Up
-- Convert meshcore_public_channel_messages from a plain GROUP-BY-payload VIEW into a LIVE,
-- insert-triggered materialized view.
--
-- Public channel messages are ALWAYS queried by timestamp (streaming poll + pagination cursor on
-- ingest_timestamp, usually scoped to a channel). An AggregatingMergeTree keyed by message identity
-- would make those queries un-indexed (the timestamp would be a merged aggregate, not a sort key).
-- So instead the MV is a DECODED, payload_type=5-only MergeTree ordered by (channel_hash,
-- ingest_timestamp) with one row per gateway-copy. Cross-gateway dedup (collapsing the same
-- encrypted message heard via multiple gateways) is done at READ time with GROUP BY message_id over
-- a timestamp-bounded scan -- exactly what the app does today, but against a smaller, pre-filtered,
-- pre-decoded table instead of all of meshcore_packets. This keeps per-channel timestamp queries
-- index-accelerated, preserves correct dedup, and is a true speedup.
--
-- This is a row-per-packet transform (no GROUP BY), so it is a pure live incremental MV and there
-- are no aggregate-state type-pinning concerns.

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS meshcore_public_channel_messages_raw
(
    ingest_timestamp  DateTime64(3),
    mesh_timestamp    DateTime64(6),
    channel_hash      String,
    mac               String,
    encrypted_message String,
    message_id        String,
    origin            String,
    origin_pubkey     String,
    path              String,
    broker            String,
    topic             String,
    region            String
)
ENGINE = MergeTree
ORDER BY (channel_hash, ingest_timestamp)
PARTITION BY toYYYYMM(ingest_timestamp);
-- +goose StatementEnd

-- Incremental MV: decode each payload_type=5 packet into a row. Created before the backfill so no
-- insert is lost.
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS meshcore_public_channel_messages_mv
TO meshcore_public_channel_messages_raw
AS
SELECT
    ingest_timestamp,
    mesh_timestamp,
    hex(substring(payload, 1, 1)) AS channel_hash,
    hex(substring(payload, 2, 2)) AS mac,
    substring(payload, 4) AS encrypted_message,
    packet_hash AS message_id,
    origin,
    hex(origin_pubkey) AS origin_pubkey,
    path,
    toString(broker) AS broker,
    toString(topic) AS topic,
    multiIf(lower(meshcore_packets.topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(meshcore_packets.topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(meshcore_packets.topic))[2]), '') AS region
FROM meshcore_packets
WHERE payload_type = 5;
-- +goose StatementEnd

-- One-time backfill of existing history (expressions identical to the MV).
-- +goose StatementBegin
INSERT INTO meshcore_public_channel_messages_raw
SELECT
    ingest_timestamp,
    mesh_timestamp,
    hex(substring(payload, 1, 1)) AS channel_hash,
    hex(substring(payload, 2, 2)) AS mac,
    substring(payload, 4) AS encrypted_message,
    packet_hash AS message_id,
    origin,
    hex(origin_pubkey) AS origin_pubkey,
    path,
    toString(broker) AS broker,
    toString(topic) AS topic,
    multiIf(lower(meshcore_packets.topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(meshcore_packets.topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(meshcore_packets.topic))[2]), '') AS region
FROM meshcore_packets
WHERE payload_type = 5;
-- +goose StatementEnd

-- Replace the public view: dedup by message_id (1:1 with the distinct payload). Exposes exactly the
-- consumed read contract; the deprecated array columns and `regions` are dropped (verified unused).
-- The hot streaming/pagination paths use a pushed-down subquery (publicChannelMessagesSubquery) that
-- filters channel_hash/ingest_timestamp on the (channel_hash, ingest_timestamp) primary key before
-- grouping; this plain view is the fallback contract and serves api/stats/popular-channels.
-- +goose StatementBegin
CREATE OR REPLACE VIEW meshcore_public_channel_messages AS
SELECT
    any(channel_hash) AS channel_hash,
    max(ingest_timestamp) AS ingest_timestamp,
    min(mesh_timestamp) AS mesh_timestamp,
    any(mac) AS mac,
    any(encrypted_message) AS encrypted_message,
    count() AS message_count,
    groupArray((origin, origin_pubkey, path, broker, topic)) AS origin_path_info,
    message_id
FROM meshcore_public_channel_messages_raw
GROUP BY message_id
ORDER BY ingest_timestamp DESC;
-- +goose StatementEnd


-- +goose Down
-- Restore the plain GROUP-BY-payload VIEW (verbatim from migration 004) before dropping the MV table.
-- +goose StatementBegin
CREATE OR REPLACE VIEW meshcore_public_channel_messages AS
SELECT
    max(ingest_timestamp) AS ingest_timestamp,
    min(mesh_timestamp) AS mesh_timestamp,
    groupArray(origin) AS origins,
    any(packet) AS packet,
    any(path_len) AS path_len,
    hex(substring(payload, 1, 1)) AS channel_hash,
    hex(substring(payload, 2, 2)) AS mac,
    substring(payload, 4) AS encrypted_message,
    count() AS message_count,
    groupArray((origin, hex(path))) AS origin_path_array, --deprecated
    groupArray((origin, hex(origin_pubkey), hex(path))) AS origin_key_path_array, --deprecated
    groupArray((broker, topic)) AS topic_broker_array, --deprecated
    groupArray((origin, hex(origin_pubkey), hex(path), broker, topic)) AS origin_path_info,
    arrayDistinct(arrayFilter(r -> r != '', groupArray(multiIf(lower(topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(topic))[2]), '')))) AS regions,
    any(packet_hash) AS message_id
FROM meshcore_packets
WHERE payload_type = 5
GROUP BY payload
ORDER BY ingest_timestamp DESC;
-- +goose StatementEnd
DROP VIEW IF EXISTS meshcore_public_channel_messages_mv;
DROP TABLE IF EXISTS meshcore_public_channel_messages_raw;
