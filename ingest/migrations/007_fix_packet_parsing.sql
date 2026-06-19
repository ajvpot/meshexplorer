-- +goose Up
-- Fix MeshCore packet parsing in the meshcore_packets read-time ALIAS columns.
--
-- Two bugs vs. the Core Protocol wire format
-- (header(1) | transport_codes(4, only if route_type in {0,3}) | path_length(1) | path(V) | payload):
--   1. The path_length byte / path / payload aliases always read path_length at byte 2 and never
--      skip the 4-byte transport_codes present on transport route types (0=TRANSPORT_FLOOD,
--      3=TRANSPORT_DIRECT). For transport packets byte 2 is a transport-code byte (garbage).
--   2. The path_length byte is NOT a raw byte count. Its low 6 bits are hop_count (0-63) and its
--      high 2 bits are a hash_size_code (0/1/2 -> 1/2/3 bytes per hop; 3 is invalid). The on-wire
--      path is hop_count * hash_size bytes. The old aliases treated the whole byte as the path
--      byte length, so any packet with hash_size_code != 0 (byte >= 64) overran the path and
--      decoded an empty payload.
--
-- Net effect: ~22% of packets decoded an empty payload, collapsing to a degenerate packet_hash
-- (used as the chat message_id) and a degenerate '' advert public_key, and silently dropping their
-- adverts/messages. The raw `packet` bytes are stored correctly, so fixing these ALIASes corrects
-- all history on read. New helper columns are exposed (notably `hash_size` = bytes per hop) so
-- downstream hop-splitters can chunk the path correctly.

-- New helper alias columns (added in dependency order; all metadata-only, retroactive on read).
ALTER TABLE meshcore_packets ADD COLUMN IF NOT EXISTS transport_off UInt8
    ALIAS if(route_type IN (0, 3), 4, 0)
    COMMENT 'Byte offset of transport_codes: 4 when route_type is TRANSPORT_FLOOD(0)/TRANSPORT_DIRECT(3), else 0';
ALTER TABLE meshcore_packets ADD COLUMN IF NOT EXISTS path_len_byte UInt8
    ALIAS reinterpretAsUInt8(substring(packet, 2 + transport_off, 1))
    COMMENT 'Raw path_length byte (after the optional transport_codes): low 6 bits hop_count, high 2 bits hash_size_code';
ALTER TABLE meshcore_packets ADD COLUMN IF NOT EXISTS hop_count UInt8
    ALIAS bitAnd(path_len_byte, 0x3F)
    COMMENT 'Number of hops in the path (low 6 bits of the path_length byte)';
ALTER TABLE meshcore_packets ADD COLUMN IF NOT EXISTS hash_size_code UInt8
    ALIAS bitShiftRight(path_len_byte, 6)
    COMMENT 'Hash size code (high 2 bits of the path_length byte): 0->1B, 1->2B, 2->3B, 3->invalid';
ALTER TABLE meshcore_packets ADD COLUMN IF NOT EXISTS hash_size UInt8
    ALIAS [1, 2, 3, 0][hash_size_code + 1]
    COMMENT 'Bytes per hop in the path (1/2/3); 0 means invalid hash_size_code (3) and the packet should be ignored';

-- Correct the path/payload aliases. path_len now means the true path byte-length (hop_count*hash_size),
-- matching its column comment. packet_hash references payload/path_len by name, so it self-corrects.
ALTER TABLE meshcore_packets MODIFY COLUMN path_len UInt8
    ALIAS hop_count * hash_size
    COMMENT 'Length of the path field in bytes (hop_count * hash_size)';
ALTER TABLE meshcore_packets MODIFY COLUMN path String
    ALIAS hex(substring(packet, 3 + transport_off, hop_count * hash_size))
    COMMENT 'Routing path as hex string (starts after header+transport_codes+path_length byte, length hop_count*hash_size)';
ALTER TABLE meshcore_packets MODIFY COLUMN payload String
    ALIAS substring(packet, 3 + transport_off + hop_count * hash_size)
    COMMENT 'Payload (starts after the path)';

-- Drop the incremental MVs BEFORE the chat-table schema change (a live MV whose SELECT column count
-- no longer matches its target table would fail on insert), then recreate them: skip invalid
-- hash_size_code=3 packets, and carry hash_size into the chat rows for correct path hop-splitting.
DROP VIEW IF EXISTS meshcore_adverts_latest_mv;
DROP VIEW IF EXISTS meshcore_public_channel_messages_mv;

-- hash_size travels with each chat row so the UI can split the path into hops (hop = hash_size bytes).
ALTER TABLE meshcore_public_channel_messages_raw ADD COLUMN IF NOT EXISTS hash_size UInt8;

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
WHERE payload_type = 4 AND hash_size_code != 3
GROUP BY public_key;
-- +goose StatementEnd

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
    multiIf(lower(meshcore_packets.topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(meshcore_packets.topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(meshcore_packets.topic))[2]), '') AS region,
    hash_size
FROM meshcore_packets
WHERE payload_type = 5 AND hash_size_code != 3;
-- +goose StatementEnd

-- Rebuild the derived tables from the now-correctly-decoded base table. Duplicate rows from the
-- short MV-recreate -> backfill overlap are harmless: argMax/min/max states collapse on merge, and
-- the chat table dedups by message_id at read.
TRUNCATE TABLE meshcore_adverts_latest_state;
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
WHERE payload_type = 4 AND hash_size_code != 3
GROUP BY public_key;
-- +goose StatementEnd

TRUNCATE TABLE meshcore_public_channel_messages_raw;
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
    multiIf(lower(meshcore_packets.topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(meshcore_packets.topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(meshcore_packets.topic))[2]), '') AS region,
    hash_size
FROM meshcore_packets
WHERE payload_type = 5 AND hash_size_code != 3;
-- +goose StatementEnd

-- Expose hash_size on the adverts view so the node page can split advert paths into hops too.
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

-- The neighbor/region REFRESH MVs (003/004) recompute hourly from the corrected aliases; trigger
-- an immediate refresh so they pick up the fix now.
SYSTEM REFRESH VIEW meshcore_all_neighbor_edges;
SYSTEM REFRESH VIEW meshcore_node_direct_neighbors;
SYSTEM REFRESH VIEW meshcore_regions;


-- +goose Down
-- Restore the migration-004 adverts view (no hash_size).
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

DROP VIEW IF EXISTS meshcore_adverts_latest_mv;
DROP VIEW IF EXISTS meshcore_public_channel_messages_mv;
ALTER TABLE meshcore_public_channel_messages_raw DROP COLUMN IF EXISTS hash_size;

-- Restore the original (buggy) aliases from migration 001 and drop the helper columns.
ALTER TABLE meshcore_packets MODIFY COLUMN path_len UInt8
    ALIAS reinterpretAsUInt8(substring(packet, 2, 1))
    COMMENT 'Length of the path field in bytes (byte 2 of packet)';
ALTER TABLE meshcore_packets MODIFY COLUMN path String
    ALIAS hex(substring(packet, 3, path_len))
    COMMENT 'Routing path as hex string (variable length, starts at byte 3, length path_len)';
ALTER TABLE meshcore_packets MODIFY COLUMN payload String
    ALIAS substring(packet, 3 + path_len, length(packet) - 2 - path_len)
    COMMENT 'Payload (starts after path, up to 184 bytes)';
ALTER TABLE meshcore_packets DROP COLUMN IF EXISTS hash_size;
ALTER TABLE meshcore_packets DROP COLUMN IF EXISTS hash_size_code;
ALTER TABLE meshcore_packets DROP COLUMN IF EXISTS hop_count;
ALTER TABLE meshcore_packets DROP COLUMN IF EXISTS path_len_byte;
ALTER TABLE meshcore_packets DROP COLUMN IF EXISTS transport_off;

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

TRUNCATE TABLE meshcore_adverts_latest_state;
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

TRUNCATE TABLE meshcore_public_channel_messages_raw;
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
