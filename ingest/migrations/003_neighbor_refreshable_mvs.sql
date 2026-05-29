-- +goose Up
-- Hourly refreshable materialized views that precompute the neighbor graph so the
-- web app reads small tables instead of re-aggregating meshcore_packets per request.
-- Both views fully recompute (atomic replace) every hour.

-- ============================================================================
-- MV 1: meshcore_all_neighbor_edges  (powers "show all neighbors")
-- The global edge graph per region (direct path_len=0 adverts + repeater-prefix
-- path edges), with denormalized endpoint details. The app filters by region +
-- bounding box + lastSeen + has_location at request time.
-- ============================================================================
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS meshcore_all_neighbor_edges
REFRESH EVERY 1 HOUR
ENGINE = MergeTree
ORDER BY (region, source_node, target_node)
AS
WITH
  regions_topics AS (
    SELECT 'seattle'  AS region, 'tcp://mqtt.davekeogh.com:1883' AS broker, arrayJoin(['meshcore', 'meshcore/salish', 'meshcore/SEA']) AS topic
    UNION ALL SELECT 'portland', 'tcp://mqtt.davekeogh.com:1883', 'meshcore/pdx'
    UNION ALL SELECT 'boston',   'tcp://mqtt.davekeogh.com:1883', 'meshcore/bos'
  ),
  node_details AS (
    SELECT public_key, node_name, latitude, longitude, has_location, last_seen
    FROM meshcore_adverts_latest
  ),
  -- Repeater prefixes per region (exactly one repeater per 2-char prefix), last 2 days
  repeater_prefixes AS (
    SELECT
      rt.region AS region,
      substring(a.public_key, 1, 2) AS prefix,
      count() AS node_count,
      any(a.public_key) AS representative_key
    FROM meshcore_adverts_latest AS a
    INNER JOIN regions_topics AS rt ON a.broker = rt.broker AND a.topic = rt.topic
    WHERE a.is_repeater = 1 AND a.last_seen >= now() - INTERVAL 2 DAY
    GROUP BY rt.region, prefix
    HAVING node_count = 1
  ),
  -- Distinct multi-hop path packets (last 1 day), tagged by region
  path_src AS (
    SELECT DISTINCT payload, path, path_len, broker, topic
    FROM meshcore_packets
    WHERE path_len >= 2 AND ingest_timestamp >= now() - INTERVAL 1 DAY
  ),
  path_pairs AS (
    SELECT DISTINCT
      rt.region AS region,
      payload,
      upper(hex(substring(path, i, 1)))     AS source_prefix,
      upper(hex(substring(path, i + 1, 1))) AS target_prefix
    FROM path_src AS p
    INNER JOIN regions_topics AS rt ON p.broker = rt.broker AND p.topic = rt.topic
    ARRAY JOIN range(1, path_len) AS i
    WHERE i < path_len
  ),
  path_neighbors AS (
    SELECT region, source_prefix, target_prefix, count() AS packet_count
    FROM path_pairs
    WHERE source_prefix != target_prefix
    GROUP BY region, source_prefix, target_prefix
  ),
  path_connections AS (
    SELECT
      pn.region AS region,
      sm.representative_key AS source_node,
      tm.representative_key AS target_node,
      pn.packet_count AS packet_count
    FROM path_neighbors AS pn
    INNER JOIN repeater_prefixes AS sm ON sm.region = pn.region AND sm.prefix = pn.source_prefix
    INNER JOIN repeater_prefixes AS tm ON tm.region = pn.region AND tm.prefix = pn.target_prefix
  ),
  -- Global direct connections (path_len = 0 adverts), last 7 days
  direct_connections AS (
    SELECT DISTINCT hex(origin_pubkey) AS source_node, public_key AS target_node
    FROM meshcore_adverts
    WHERE path_len = 0
      AND hex(origin_pubkey) != public_key
      AND ingest_timestamp >= now() - INTERVAL 7 DAY
  ),
  -- Per-region edges: path edges + direct edges not already covered by a path edge
  edges AS (
    SELECT region, source_node, target_node, 'path' AS connection_type, packet_count
    FROM path_connections
    UNION ALL
    SELECT r.region, d.source_node, d.target_node, 'direct' AS connection_type, CAST(1 AS UInt64) AS packet_count
    FROM direct_connections AS d
    CROSS JOIN (SELECT DISTINCT region FROM regions_topics) AS r
    WHERE (r.region, d.source_node, d.target_node) NOT IN (SELECT region, source_node, target_node FROM path_connections)
      AND (r.region, d.target_node, d.source_node) NOT IN (SELECT region, source_node, target_node FROM path_connections)
  )
SELECT
  e.region AS region,
  e.source_node AS source_node,
  e.target_node AS target_node,
  e.connection_type AS connection_type,
  e.packet_count AS packet_count,
  sd.node_name AS source_name,
  sd.latitude AS source_latitude,
  sd.longitude AS source_longitude,
  sd.has_location AS source_has_location,
  sd.last_seen AS source_last_seen,
  td.node_name AS target_name,
  td.latitude AS target_latitude,
  td.longitude AS target_longitude,
  td.has_location AS target_has_location,
  td.last_seen AS target_last_seen
FROM edges AS e
INNER JOIN node_details AS sd ON e.source_node = sd.public_key
INNER JOIN node_details AS td ON e.target_node = td.public_key;
-- +goose StatementEnd

-- ============================================================================
-- MV 2: meshcore_node_direct_neighbors  (powers node hover + node page)
-- Direct adjacency (path_len = 0) for every node, both directions, with the
-- neighbor's latest attributes. The app filters by node_public_key at request time.
-- ============================================================================
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

-- +goose Down
DROP VIEW IF EXISTS meshcore_node_direct_neighbors;
DROP VIEW IF EXISTS meshcore_all_neighbor_edges;
