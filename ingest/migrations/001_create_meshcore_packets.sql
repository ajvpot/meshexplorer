-- +goose Up
CREATE TABLE IF NOT EXISTS meshcore_packets (
    ingest_timestamp DateTime64(3) COMMENT 'Timestamp when the packet was ingested into the database',
    -- todo change to low cardinality
    origin String COMMENT 'Origin field from meshcore/raw',
    origin_pubkey String COMMENT 'Public key of the origin node (raw packets) or gateway ID (binary packets)',
    broker LowCardinality(String) COMMENT 'Message broker identifier',
    topic LowCardinality(String) COMMENT 'Message topic',
    mesh_timestamp DateTime64(6) COMMENT 'Timestamp from meshcore/raw',
    packet String COMMENT 'Raw MeshCore packet as a string',
    -- Extract the first byte as header
    header UInt8 ALIAS reinterpretAsUInt8(substring(packet, 1, 1)) COMMENT 'Header byte: routing type, payload type, payload version',
    -- Use bitwise operations on header as per MeshCore spec
    route_type UInt8 ALIAS bitAnd(header, 0x03) COMMENT 'Route Type (bits 0-1 of header): 0=ROUTE_TYPE_TRANSPORT_FLOOD, 1=ROUTE_TYPE_FLOOD, 2=ROUTE_TYPE_DIRECT, 3=ROUTE_TYPE_TRANSPORT_DIRECT',
    payload_type UInt8 ALIAS bitAnd(bitShiftRight(header, 2), 0x0F) COMMENT 'Payload Type (bits 2-5 of header): 0=PAYLOAD_TYPE_REQ, 1=PAYLOAD_TYPE_RESPONSE, 2=PAYLOAD_TYPE_TXT_MSG, 3=PAYLOAD_TYPE_ACK, 4=PAYLOAD_TYPE_ADVERT, 5=PAYLOAD_TYPE_GRP_TXT, 6=PAYLOAD_TYPE_GRP_DATA, 7=PAYLOAD_TYPE_ANON_REQ, 8=PAYLOAD_TYPE_PATH, 9=PAYLOAD_TYPE_TRACE, 15=PAYLOAD_TYPE_RAW_CUSTOM',
    payload_version UInt8 ALIAS bitAnd(bitShiftRight(header, 6), 0x03) COMMENT 'Payload Version (bits 6-7 of header): 0=V1, 1=V2, 2=V3, 3=V4',
    path_len UInt8 ALIAS reinterpretAsUInt8(substring(packet, 2, 1)) COMMENT 'Length of the path field in bytes (byte 2 of packet)',
    path String ALIAS hex(substring(packet, 3, path_len)) COMMENT 'Routing path as hex string (variable length, starts at byte 3, length path_len)',
    payload String ALIAS substring(packet, 3 + path_len, length(packet) - 2 - path_len) COMMENT 'Payload (starts after path, up to 184 bytes)',
    packet_hash String ALIAS hex(substring(SHA256(concat(
        reinterpretAsFixedString(toUInt8(payload_type)),
        CASE WHEN payload_type = 9 THEN reinterpretAsFixedString(toUInt32(path_len)) ELSE '' END,
        payload
    )), 1, 8)) COMMENT 'Packet hash calculated using SHA-256: payload_type + path_len (TRACE only) + payload_data, truncated to 8 bytes'
) ENGINE = ReplacingMergeTree(ingest_timestamp)
ORDER BY (ingest_timestamp, origin, mesh_timestamp, packet)
PARTITION BY toYYYYMM(ingest_timestamp)
COMMENT 'Table for storing MeshCore packets with extracted fields via alias columns.';

-- View to decode node info packets (payload_type = 4)
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

CREATE OR REPLACE VIEW meshcore_adverts_latest AS
SELECT
    public_key,
    min(ingest_timestamp) AS first_heard,
    max(ingest_timestamp) AS last_seen,
    argMax(broker, ingest_timestamp) AS broker,
    argMax(topic, ingest_timestamp) AS topic,
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

-- View to decode public channel group text messages (payload_type = 5)
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
    any(packet_hash) AS message_id
FROM meshcore_packets
WHERE payload_type = 5
GROUP BY payload
ORDER BY ingest_timestamp DESC;


-- +goose Down
DROP VIEW IF EXISTS meshcore_public_channel_messages;
DROP VIEW IF EXISTS meshcore_adverts_latest;
DROP VIEW IF EXISTS meshcore_adverts;
DROP TABLE IF EXISTS meshcore_packets;
