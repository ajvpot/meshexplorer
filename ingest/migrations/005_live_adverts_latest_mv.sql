-- +goose Up
-- Convert meshcore_adverts_latest from a plain argMax/GROUP-BY-public_key VIEW (which
-- re-aggregates the entire payload_type=4 history on every read) into a LIVE, insert-triggered
-- materialized view backed by an AggregatingMergeTree state table.
--
-- An incremental MV only sees the newly-inserted block, so it cannot do a global GROUP BY
-- across history. The standard pattern (used here) is: an AggregatingMergeTree target table
-- holding per-public_key partial aggregate states (argMaxState/minState/maxState), an
-- incremental MV that emits those states per inserted block, and a thin read-side VIEW that
-- collapses them with -Merge ... GROUP BY public_key. The public name `meshcore_adverts_latest`
-- stays a VIEW exposing the identical column contract, so unified_latest_nodeinfo,
-- api/stats/repeater-prefixes, and the hourly REFRESH MVs (meshcore_all_neighbor_edges,
-- meshcore_node_direct_neighbors, meshcore_regions) keep working unchanged.
--
-- Type-pinning notes (argMaxState value type must EXACTLY equal the SELECT expression type):
--   * bool flags (is_*/has_*) -> toUInt8(...) over UInt8 state columns
--   * broker/topic are LowCardinality(String) -> toString(...) over plain String state columns
--     (the merge view re-exposes plain String; all consumers accept String)
--   * latitude_i/longitude_i are Nullable(Int32); latitude/longitude are Nullable(Float64)

-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS meshcore_adverts_latest_state
(
    public_key      String,
    first_heard     AggregateFunction(min, DateTime64(3)),
    last_seen       AggregateFunction(max, DateTime64(3)),
    broker          AggregateFunction(argMax, String,            DateTime64(3)),
    topic           AggregateFunction(argMax, String,            DateTime64(3)),
    region          AggregateFunction(argMax, String,            DateTime64(3)),
    origin          AggregateFunction(argMax, String,            DateTime64(3)),
    mesh_timestamp  AggregateFunction(argMax, DateTime64(6),     DateTime64(3)),
    packet          AggregateFunction(argMax, String,            DateTime64(3)),
    path_len        AggregateFunction(argMax, UInt8,             DateTime64(3)),
    path            AggregateFunction(argMax, String,            DateTime64(3)),
    adv_timestamp   AggregateFunction(argMax, UInt32,            DateTime64(3)),
    signature       AggregateFunction(argMax, String,            DateTime64(3)),
    appdata_flags   AggregateFunction(argMax, UInt8,             DateTime64(3)),
    is_chat_node    AggregateFunction(argMax, UInt8,             DateTime64(3)),
    is_repeater     AggregateFunction(argMax, UInt8,             DateTime64(3)),
    is_room_server  AggregateFunction(argMax, UInt8,             DateTime64(3)),
    has_location    AggregateFunction(argMax, UInt8,             DateTime64(3)),
    has_feature1    AggregateFunction(argMax, UInt8,             DateTime64(3)),
    has_feature2    AggregateFunction(argMax, UInt8,             DateTime64(3)),
    has_name        AggregateFunction(argMax, UInt8,             DateTime64(3)),
    latitude_i      AggregateFunction(argMax, Nullable(Int32),   DateTime64(3)),
    longitude_i     AggregateFunction(argMax, Nullable(Int32),   DateTime64(3)),
    latitude        AggregateFunction(argMax, Nullable(Float64), DateTime64(3)),
    longitude       AggregateFunction(argMax, Nullable(Float64), DateTime64(3)),
    node_name       AggregateFunction(argMax, String,            DateTime64(3)),
    node_hash       AggregateFunction(argMax, String,            DateTime64(3)),
    packet_hash     AggregateFunction(argMax, String,            DateTime64(3))
)
ENGINE = AggregatingMergeTree
ORDER BY public_key;
-- +goose StatementEnd

-- Incremental MV: fires on every insert into meshcore_packets. Reads the base table directly
-- (an MV cannot trigger off the meshcore_adverts VIEW) and inlines the payload decode.
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS meshcore_adverts_latest_mv
TO meshcore_adverts_latest_state
AS
SELECT
    hex(substring(payload, 1, 32)) AS public_key,
    minState(ingest_timestamp) AS first_heard,
    maxState(ingest_timestamp) AS last_seen,
    argMaxState(toString(broker), ingest_timestamp) AS broker,
    argMaxState(toString(topic), ingest_timestamp) AS topic,
    argMaxState(multiIf(lower(meshcore_packets.topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(meshcore_packets.topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(meshcore_packets.topic))[2]), ''), ingest_timestamp) AS region,
    argMaxState(origin, ingest_timestamp) AS origin,
    argMaxState(mesh_timestamp, ingest_timestamp) AS mesh_timestamp,
    argMaxState(packet, ingest_timestamp) AS packet,
    argMaxState(path_len, ingest_timestamp) AS path_len,
    argMaxState(path, ingest_timestamp) AS path,
    argMaxState(reinterpretAsUInt32(substring(payload, 33, 4)), ingest_timestamp) AS adv_timestamp,
    argMaxState(hex(substring(payload, 37, 64)), ingest_timestamp) AS signature,
    argMaxState(reinterpretAsUInt8(substring(payload, 101, 1)), ingest_timestamp) AS appdata_flags,
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x01) = 0x01), ingest_timestamp) AS is_chat_node,
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x02) = 0x02), ingest_timestamp) AS is_repeater,
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x03) = 0x03), ingest_timestamp) AS is_room_server,
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10), ingest_timestamp) AS has_location,
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x20) = 0x20), ingest_timestamp) AS has_feature1,
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x40) = 0x40), ingest_timestamp) AS has_feature2,
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x80) = 0x80), ingest_timestamp) AS has_name,
    argMaxState(CASE WHEN bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10 THEN reinterpretAsInt32(substring(payload, 102, 4)) ELSE NULL END, ingest_timestamp) AS latitude_i,
    argMaxState(CASE WHEN bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10 THEN reinterpretAsInt32(substring(payload, 106, 4)) ELSE NULL END, ingest_timestamp) AS longitude_i,
    argMaxState((CASE WHEN bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10 THEN reinterpretAsInt32(substring(payload, 102, 4)) ELSE NULL END) * 1e-6, ingest_timestamp) AS latitude,
    argMaxState((CASE WHEN bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10 THEN reinterpretAsInt32(substring(payload, 106, 4)) ELSE NULL END) * 1e-6, ingest_timestamp) AS longitude,
    argMaxState(substring(payload, 102 + multiIf(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10, 8, 0)), ingest_timestamp) AS node_name,
    argMaxState(hex(substring(payload, 1, 1)), ingest_timestamp) AS node_hash,
    argMaxState(packet_hash, ingest_timestamp) AS packet_hash
FROM meshcore_packets
WHERE payload_type = 4
GROUP BY public_key;
-- +goose StatementEnd

-- One-time backfill of existing history. Created AFTER the MV so no insert is lost; the small
-- create->backfill overlap can double-count rows, which is harmless for min/max/argMax
-- (duplicate (value, ingest_timestamp) pairs collapse on merge).
-- +goose StatementBegin
INSERT INTO meshcore_adverts_latest_state
SELECT
    hex(substring(payload, 1, 32)) AS public_key,
    minState(ingest_timestamp),
    maxState(ingest_timestamp),
    argMaxState(toString(broker), ingest_timestamp),
    argMaxState(toString(topic), ingest_timestamp),
    argMaxState(multiIf(lower(meshcore_packets.topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(meshcore_packets.topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(meshcore_packets.topic))[2]), ''), ingest_timestamp),
    argMaxState(origin, ingest_timestamp),
    argMaxState(mesh_timestamp, ingest_timestamp),
    argMaxState(packet, ingest_timestamp),
    argMaxState(path_len, ingest_timestamp),
    argMaxState(path, ingest_timestamp),
    argMaxState(reinterpretAsUInt32(substring(payload, 33, 4)), ingest_timestamp),
    argMaxState(hex(substring(payload, 37, 64)), ingest_timestamp),
    argMaxState(reinterpretAsUInt8(substring(payload, 101, 1)), ingest_timestamp),
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x01) = 0x01), ingest_timestamp),
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x02) = 0x02), ingest_timestamp),
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x03) = 0x03), ingest_timestamp),
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10), ingest_timestamp),
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x20) = 0x20), ingest_timestamp),
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x40) = 0x40), ingest_timestamp),
    argMaxState(toUInt8(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x80) = 0x80), ingest_timestamp),
    argMaxState(CASE WHEN bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10 THEN reinterpretAsInt32(substring(payload, 102, 4)) ELSE NULL END, ingest_timestamp),
    argMaxState(CASE WHEN bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10 THEN reinterpretAsInt32(substring(payload, 106, 4)) ELSE NULL END, ingest_timestamp),
    argMaxState((CASE WHEN bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10 THEN reinterpretAsInt32(substring(payload, 102, 4)) ELSE NULL END) * 1e-6, ingest_timestamp),
    argMaxState((CASE WHEN bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10 THEN reinterpretAsInt32(substring(payload, 106, 4)) ELSE NULL END) * 1e-6, ingest_timestamp),
    argMaxState(substring(payload, 102 + multiIf(bitAnd(reinterpretAsUInt8(substring(payload, 101, 1)), 0x10) = 0x10, 8, 0)), ingest_timestamp),
    argMaxState(hex(substring(payload, 1, 1)), ingest_timestamp),
    argMaxState(packet_hash, ingest_timestamp)
FROM meshcore_packets
WHERE payload_type = 4
GROUP BY public_key;
-- +goose StatementEnd

-- Replace the public view in place: same column set/names/order as before, now collapsing the
-- partial states with -Merge. Stays a VIEW, so downstream consumers are untouched.
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


-- +goose Down
-- Restore the plain argMax/GROUP-BY VIEW (verbatim from migration 004) before dropping the
-- state objects so the public name is never broken.
-- +goose StatementBegin
CREATE OR REPLACE VIEW meshcore_adverts_latest AS
SELECT
    public_key,
    min(ingest_timestamp) AS first_heard,
    max(ingest_timestamp) AS last_seen,
    argMax(broker, ingest_timestamp) AS broker,
    argMax(topic, ingest_timestamp) AS topic,
    argMax(region, ingest_timestamp) AS region,
    argMax(origin, ingest_timestamp) AS origin,
    argMax(mesh_timestamp, ingest_timestamp) AS mesh_timestamp,
    argMax(packet, ingest_timestamp) AS packet,
    argMax(path_len, ingest_timestamp) AS path_len,
    argMax(path, ingest_timestamp) AS path,
    argMax(adv_timestamp, ingest_timestamp) AS adv_timestamp,
    argMax(signature, ingest_timestamp) AS signature,
    argMax(appdata_flags, ingest_timestamp) AS appdata_flags,
    argMax(is_chat_node, ingest_timestamp) AS is_chat_node,
    argMax(is_repeater, ingest_timestamp) AS is_repeater,
    argMax(is_room_server, ingest_timestamp) AS is_room_server,
    argMax(has_location, ingest_timestamp) AS has_location,
    argMax(has_feature1, ingest_timestamp) AS has_feature1,
    argMax(has_feature2, ingest_timestamp) AS has_feature2,
    argMax(has_name, ingest_timestamp) AS has_name,
    argMax(latitude_i, ingest_timestamp) AS latitude_i,
    argMax(longitude_i, ingest_timestamp) AS longitude_i,
    argMax(latitude, ingest_timestamp) AS latitude,
    argMax(longitude, ingest_timestamp) AS longitude,
    argMax(node_name, ingest_timestamp) AS node_name,
    argMax(node_hash, ingest_timestamp) AS node_hash,
    argMax(packet_hash, ingest_timestamp) AS packet_hash
FROM meshcore_adverts
GROUP BY public_key
ORDER BY last_seen DESC;
-- +goose StatementEnd
DROP VIEW IF EXISTS meshcore_adverts_latest_mv;
DROP TABLE IF EXISTS meshcore_adverts_latest_state;
