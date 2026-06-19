-- +goose Up
-- Decode the advert (payload_type=4) node TYPE correctly.
--
-- The advert app_data flags byte (payload offset 101) uses split encoding per the Core Protocol
-- spec (§2.8.3): the LOW 4 bits are an integer node-type ENUM, the HIGH 4 bits are independent
-- presence flags.
--   node type (bits 0-3, 0x0F): 0=NONE, 1=CHAT/companion, 2=REPEATER, 3=ROOM server, 4=SENSOR
--   presence  (bits 4-7):       0x10 has_location, 0x20 feature1, 0x40 feature2, 0x80 has_name
--
-- The original decode treated the type as independent bit flags:
--   is_chat_node   = flags & 0x01,  is_repeater = flags & 0x02,  is_room_server = flags & 0x03.
-- Because a ROOM server is type 3 (binary 0011) it matched ALL THREE tests at once (shown as
-- repeater + companion + room simultaneously), and a SENSOR (type 4) matched NONE (shown as an
-- untyped/unknown node). This fixes the derivation to the enum, adds is_sensor, and exposes a
-- node_type column. The presence-flag (has_*) decoding was already correct and is unchanged.
--
-- These are read-time VIEW changes over already-stored data (appdata_flags / payload), so the fix
-- applies retroactively to all history with no reingest or backfill. The is_chat_node/is_repeater/
-- is_room_server AggregateFunction columns in meshcore_adverts_latest_state predate this fix and
-- held the old bitmask values; the read view below now derives the booleans from the (correctly
-- stored) appdata_flags instead, so those state columns are intentionally bypassed.

-- meshcore_adverts: enum-based node type + is_sensor + node_type (otherwise identical to migration 007).
-- +goose StatementBegin
CREATE OR REPLACE VIEW meshcore_adverts AS
SELECT
    ingest_timestamp,
    origin,
    origin_pubkey,
    mesh_timestamp,
    packet,
    path_len,
    path,
    hash_size,
    broker,
    topic,
    multiIf(lower(topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(topic))[2]), '') AS region,
    hex(substring(payload, 1, 32)) AS public_key,
    reinterpretAsUInt32(substring(payload, 33, 4)) AS adv_timestamp,
    hex(substring(payload, 37, 64)) AS signature,
    reinterpretAsUInt8(substring(payload, 101, 1)) AS appdata_flags,
    bitAnd(appdata_flags, 0x0F) AS node_type,
    node_type = 1 AS is_chat_node,
    node_type = 2 AS is_repeater,
    node_type = 3 AS is_room_server,
    node_type = 4 AS is_sensor,
    bitAnd(appdata_flags, 0x10) = 0x10 AS has_location,
    bitAnd(appdata_flags, 0x20) = 0x20 AS has_feature1,
    bitAnd(appdata_flags, 0x40) = 0x40 AS has_feature2,
    bitAnd(appdata_flags, 0x80) = 0x80 AS has_name,
    CASE WHEN bitAnd(appdata_flags, 0x10) = 0x10
        THEN reinterpretAsInt32(substring(payload, 102, 4))
        ELSE NULL
    END AS latitude_i,
    CASE WHEN bitAnd(appdata_flags, 0x10) = 0x10
        THEN reinterpretAsInt32(substring(payload, 106, 4))
        ELSE NULL
    END AS longitude_i,
    latitude_i * 1e-6 AS latitude,
    longitude_i * 1e-6 AS longitude,
    substring(
        payload,
        102
        + multiIf(bitAnd(appdata_flags, 0x10) = 0x10, 8, 0)
    ) AS     node_name,
    hex(substring(payload, 1, 1)) AS node_hash,
    packet_hash
FROM meshcore_packets
WHERE payload_type = 4;
-- +goose StatementEnd

-- meshcore_adverts_latest: derive the type booleans + node_type from the merged appdata_flags
-- (bypassing the legacy bitmask state columns). Same column contract as migration 005 plus the
-- new is_sensor / node_type columns.
-- +goose StatementBegin
CREATE OR REPLACE VIEW meshcore_adverts_latest AS
SELECT
    public_key,
    minMerge(first_heard) AS first_heard,
    maxMerge(last_seen) AS last_seen,
    argMaxMerge(broker) AS broker,
    argMaxMerge(topic) AS topic,
    argMaxMerge(region) AS region,
    argMaxMerge(origin) AS origin,
    argMaxMerge(mesh_timestamp) AS mesh_timestamp,
    argMaxMerge(packet) AS packet,
    argMaxMerge(path_len) AS path_len,
    argMaxMerge(path) AS path,
    argMaxMerge(adv_timestamp) AS adv_timestamp,
    argMaxMerge(signature) AS signature,
    argMaxMerge(appdata_flags) AS appdata_flags,
    bitAnd(appdata_flags, 0x0F) AS node_type,
    toUInt8(node_type = 1) AS is_chat_node,
    toUInt8(node_type = 2) AS is_repeater,
    toUInt8(node_type = 3) AS is_room_server,
    toUInt8(node_type = 4) AS is_sensor,
    argMaxMerge(has_location) AS has_location,
    argMaxMerge(has_feature1) AS has_feature1,
    argMaxMerge(has_feature2) AS has_feature2,
    argMaxMerge(has_name) AS has_name,
    argMaxMerge(latitude_i) AS latitude_i,
    argMaxMerge(longitude_i) AS longitude_i,
    argMaxMerge(latitude) AS latitude,
    argMaxMerge(longitude) AS longitude,
    argMaxMerge(node_name) AS node_name,
    argMaxMerge(node_hash) AS node_hash,
    argMaxMerge(packet_hash) AS packet_hash
FROM meshcore_adverts_latest_state
GROUP BY public_key
ORDER BY last_seen DESC;
-- +goose StatementEnd

-- Carry the corrected type onto the per-node direct-neighbor graph: the existing
-- neighbor_is_repeater/is_chat_node/is_room_server already self-correct (they read from
-- meshcore_adverts_latest), but a neighbor_is_sensor column is added so sensor neighbors render too.
DROP VIEW IF EXISTS meshcore_node_direct_neighbors;
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS meshcore_node_direct_neighbors
REFRESH EVERY 1 HOUR
ENGINE = MergeTree
ORDER BY (node_public_key)
AS
WITH
  node_details AS (
    SELECT public_key, node_name, latitude, longitude, has_location,
           is_repeater, is_chat_node, is_room_server, is_sensor, has_name, last_seen
    FROM meshcore_adverts_latest
  ),
  directions AS (
    SELECT DISTINCT hex(origin_pubkey) AS node_public_key, public_key AS neighbor_public_key, 'incoming' AS direction
    FROM meshcore_adverts
    WHERE path_len = 0 AND hex(origin_pubkey) != public_key AND ingest_timestamp >= now() - INTERVAL 7 DAY
    UNION ALL
    SELECT DISTINCT public_key AS node_public_key, hex(origin_pubkey) AS neighbor_public_key, 'outgoing' AS direction
    FROM meshcore_adverts
    WHERE path_len = 0 AND hex(origin_pubkey) != public_key AND ingest_timestamp >= now() - INTERVAL 7 DAY
  )
SELECT
  d.node_public_key AS node_public_key,
  d.neighbor_public_key AS neighbor_public_key,
  d.direction AS direction,
  nd.node_name AS neighbor_name,
  nd.latitude AS neighbor_latitude,
  nd.longitude AS neighbor_longitude,
  nd.has_location AS neighbor_has_location,
  nd.is_repeater AS neighbor_is_repeater,
  nd.is_chat_node AS neighbor_is_chat_node,
  nd.is_room_server AS neighbor_is_room_server,
  nd.is_sensor AS neighbor_is_sensor,
  nd.has_name AS neighbor_has_name,
  nd.last_seen AS neighbor_last_seen
FROM directions AS d
INNER JOIN node_details AS nd ON d.neighbor_public_key = nd.public_key;
-- +goose StatementEnd

-- Apply the corrected derivation immediately (these REFRESH MVs otherwise recompute hourly).
SYSTEM REFRESH VIEW meshcore_node_direct_neighbors;
SYSTEM REFRESH VIEW meshcore_all_neighbor_edges;


-- +goose Down
-- Restore the migration-007 adverts view (bitmask flags, no is_sensor/node_type).
-- +goose StatementBegin
CREATE OR REPLACE VIEW meshcore_adverts AS
SELECT
    ingest_timestamp,
    origin,
    origin_pubkey,
    mesh_timestamp,
    packet,
    path_len,
    path,
    hash_size,
    broker,
    topic,
    multiIf(lower(topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(topic))[2]), '') AS region,
    hex(substring(payload, 1, 32)) AS public_key,
    reinterpretAsUInt32(substring(payload, 33, 4)) AS adv_timestamp,
    hex(substring(payload, 37, 64)) AS signature,
    reinterpretAsUInt8(substring(payload, 101, 1)) AS appdata_flags,
    bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x01) = 0x01 AS is_chat_node,
    bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x02) = 0x02 AS is_repeater,
    bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x03) = 0x03 AS is_room_server,
    bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10 AS has_location,
    bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x20) = 0x20 AS has_feature1,
    bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x40) = 0x40 AS has_feature2,
    bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x80) = 0x80 AS has_name,
    CASE WHEN bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10
        THEN reinterpretAsInt32(substring(payload, 102, 4))
        ELSE NULL
    END AS latitude_i,
    CASE WHEN bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10
        THEN reinterpretAsInt32(substring(payload, 106, 4))
        ELSE NULL
    END AS longitude_i,
    latitude_i * 1e-6 AS latitude,
    longitude_i * 1e-6 AS longitude,
    substring(
        payload,
        102
        + multiIf(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10, 8, 0)
    ) AS     node_name,
    hex(substring(payload, 1, 1)) AS node_hash,
    packet_hash
FROM meshcore_packets
WHERE payload_type = 4;
-- +goose StatementEnd

-- Restore the migration-005 latest view (reads the bitmask state columns, no is_sensor/node_type).
-- +goose StatementBegin
CREATE OR REPLACE VIEW meshcore_adverts_latest AS
SELECT
    public_key,
    minMerge(first_heard) AS first_heard,
    maxMerge(last_seen) AS last_seen,
    argMaxMerge(broker) AS broker,
    argMaxMerge(topic) AS topic,
    argMaxMerge(region) AS region,
    argMaxMerge(origin) AS origin,
    argMaxMerge(mesh_timestamp) AS mesh_timestamp,
    argMaxMerge(packet) AS packet,
    argMaxMerge(path_len) AS path_len,
    argMaxMerge(path) AS path,
    argMaxMerge(adv_timestamp) AS adv_timestamp,
    argMaxMerge(signature) AS signature,
    argMaxMerge(appdata_flags) AS appdata_flags,
    argMaxMerge(is_chat_node) AS is_chat_node,
    argMaxMerge(is_repeater) AS is_repeater,
    argMaxMerge(is_room_server) AS is_room_server,
    argMaxMerge(has_location) AS has_location,
    argMaxMerge(has_feature1) AS has_feature1,
    argMaxMerge(has_feature2) AS has_feature2,
    argMaxMerge(has_name) AS has_name,
    argMaxMerge(latitude_i) AS latitude_i,
    argMaxMerge(longitude_i) AS longitude_i,
    argMaxMerge(latitude) AS latitude,
    argMaxMerge(longitude) AS longitude,
    argMaxMerge(node_name) AS node_name,
    argMaxMerge(node_hash) AS node_hash,
    argMaxMerge(packet_hash) AS packet_hash
FROM meshcore_adverts_latest_state
GROUP BY public_key
ORDER BY last_seen DESC;
-- +goose StatementEnd

-- Restore the migration-003 direct-neighbor MV (no neighbor_is_sensor).
DROP VIEW IF EXISTS meshcore_node_direct_neighbors;
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS meshcore_node_direct_neighbors
REFRESH EVERY 1 HOUR
ENGINE = MergeTree
ORDER BY (node_public_key)
AS
WITH
  node_details AS (
    SELECT public_key, node_name, latitude, longitude, has_location,
           is_repeater, is_chat_node, is_room_server, has_name, last_seen
    FROM meshcore_adverts_latest
  ),
  directions AS (
    SELECT DISTINCT hex(origin_pubkey) AS node_public_key, public_key AS neighbor_public_key, 'incoming' AS direction
    FROM meshcore_adverts
    WHERE path_len = 0 AND hex(origin_pubkey) != public_key AND ingest_timestamp >= now() - INTERVAL 7 DAY
    UNION ALL
    SELECT DISTINCT public_key AS node_public_key, hex(origin_pubkey) AS neighbor_public_key, 'outgoing' AS direction
    FROM meshcore_adverts
    WHERE path_len = 0 AND hex(origin_pubkey) != public_key AND ingest_timestamp >= now() - INTERVAL 7 DAY
  )
SELECT
  d.node_public_key AS node_public_key,
  d.neighbor_public_key AS neighbor_public_key,
  d.direction AS direction,
  nd.node_name AS neighbor_name,
  nd.latitude AS neighbor_latitude,
  nd.longitude AS neighbor_longitude,
  nd.has_location AS neighbor_has_location,
  nd.is_repeater AS neighbor_is_repeater,
  nd.is_chat_node AS neighbor_is_chat_node,
  nd.is_room_server AS neighbor_is_room_server,
  nd.has_name AS neighbor_has_name,
  nd.last_seen AS neighbor_last_seen
FROM directions AS d
INNER JOIN node_details AS nd ON d.neighbor_public_key = nd.public_key;
-- +goose StatementEnd
SYSTEM REFRESH VIEW meshcore_node_direct_neighbors;
