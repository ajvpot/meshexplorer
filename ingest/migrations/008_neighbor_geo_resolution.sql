-- +goose Up
-- Rework meshcore_all_neighbor_edges to derive far more (and higher-quality) neighbor edges.
--
-- The migration-004 path-edge logic had three defects:
--   1. It hard-coded 1-byte hops (substring(path, 2*i-1, 2)), so every extended-hash packet
--      (hash_size 2/3, added in migration 007) was mis-sliced into garbage prefixes.
--   2. It kept a 1-byte prefix only if exactly one repeater in the region owned it
--      (HAVING node_count = 1). With only 256 one-byte buckets and often more repeaters than
--      that per region, birthday collisions discard most prefixes, and a 1-byte "unique" match
--      is itself unreliable (it frequently stitches together non-adjacent nodes).
--   3. It could not exploit extended hashes, whose 2-/3-byte prefixes (65 536+ buckets) are
--      almost always unique and resolve to genuinely adjacent nodes.
--
-- The new MV derives edges in confidence tiers and tags each with `method`/`confidence` so the
-- map can filter. All path/anchor tiers read FLOOD packets (route_type 0/1, where the path is
-- accumulated toward the gateway) over a 7-day window, parse hops at the packet's real hash_size,
-- and aggregate prefix pairs BEFORE joining (keeps the refresh ~20s, not minutes):
--   * direct        - path_len=0 adverts: gateway heard advertiser at zero hops. (unchanged)
--   * anchor-origin - advert originator (full key + location) was heard by the first path hop;
--                     resolve that hop to the single in-region repeater within MAX_HOP of the originator.
--   * anchor-gateway- the uploading gateway (full key + location) heard the last path hop;
--                     resolve to the single in-region repeater within MAX_HOP of the gateway.
-- MAX_HOP (206 km) is an upper bound on a plausible single LoRa hop between two located nodes;
-- adjacencies longer than this are treated as hash-collision artifacts and dropped.
--   * path-uniq-3b / -2b / -1b - consecutive path hops resolved by region-wide prefix uniqueness
--                     at the pair's own hash width (3-/2-byte are high quality; 1-byte is the noisy
--                     low-confidence fallback).
-- Edges are canonicalized undirected and aggregated across all observations (observation_count).

DROP VIEW IF EXISTS meshcore_all_neighbor_edges;
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS meshcore_all_neighbor_edges
REFRESH EVERY 1 HOUR
ENGINE = MergeTree
ORDER BY (region, source_node, target_node)
AS
WITH
  node_details AS (
    SELECT
      public_key,
      node_name,
      last_seen,
      ifNull(latitude, 0.) AS lat,
      ifNull(longitude, 0.) AS lon,
      -- (0,0) / missing coords are treated as "no usable location" (avoids edges drawn to null island)
      (has_location AND abs(ifNull(latitude, 0.)) > 0.01 AND abs(ifNull(longitude, 0.)) > 0.01) AS loc_ok
    FROM meshcore_adverts_latest
  ),
  -- Repeaters seen in the last 2 days, region derived from their latest topic.
  repeaters AS (
    SELECT
      public_key,
      multiIf(lower(topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(topic))[2]), '') AS region,
      ifNull(latitude, 0.) AS lat,
      ifNull(longitude, 0.) AS lon,
      (has_location AND abs(ifNull(latitude, 0.)) > 0.01 AND abs(ifNull(longitude, 0.)) > 0.01) AS loc_ok
    FROM meshcore_adverts_latest
    WHERE is_repeater = 1 AND last_seen >= now() - INTERVAL 2 DAY
  ),
  repeaters_loc AS (SELECT * FROM repeaters WHERE loc_ok AND region != ''),
  -- (region, width, prefix) -> representative key, with the count used to assert uniqueness (n = 1)
  -- at each possible hash width (1/2/3 bytes = 2/4/6 hex chars).
  prefix_uniq AS (
    SELECT region, 1 AS w, substring(public_key, 1, 2) AS prefix, any(public_key) AS key, count() AS n
      FROM repeaters WHERE region != '' GROUP BY region, substring(public_key, 1, 2)
    UNION ALL
    SELECT region, 2 AS w, substring(public_key, 1, 4) AS prefix, any(public_key) AS key, count() AS n
      FROM repeaters WHERE region != '' GROUP BY region, substring(public_key, 1, 4)
    UNION ALL
    SELECT region, 3 AS w, substring(public_key, 1, 6) AS prefix, any(public_key) AS key, count() AS n
      FROM repeaters WHERE region != '' GROUP BY region, substring(public_key, 1, 6)
  ),
  -- Consecutive hop-prefix pairs across all flood packets, aggregated BEFORE the join. Each hop is
  -- 2*hash_size hex chars; pair i is (hop i, hop i+1). Distinct pairs are few, so this collapses the
  -- ~50M exploded pairs to a small set and keeps the downstream joins cheap.
  path_pair_counts AS (
    SELECT region, hash_size, tupleElement(pair, 1) AS src_prefix, tupleElement(pair, 2) AS dst_prefix, count() AS obs
    FROM (
      SELECT
        multiIf(lower(topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(topic))[2]), '') AS region,
        hash_size,
        arrayMap(i -> (substring(path, 2*hash_size*(i-1)+1, 2*hash_size), substring(path, 2*hash_size*i+1, 2*hash_size)), range(1, hop_count)) AS pairs
      FROM meshcore_packets
      WHERE ingest_timestamp >= now() - INTERVAL 7 DAY
        AND hash_size_code != 3 AND hash_size != 0 AND route_type IN (0, 1) AND hop_count >= 2
    ) ARRAY JOIN pairs AS pair
    WHERE region != '' AND tupleElement(pair, 1) != tupleElement(pair, 2)
    GROUP BY region, hash_size, src_prefix, dst_prefix
  ),
  edges_path_uniq AS (
    SELECT ppc.region AS region, su.key AS source_node, du.key AS target_node,
      multiIf(ppc.hash_size >= 3, 'path-uniq-3b', ppc.hash_size = 2, 'path-uniq-2b', 'path-uniq-1b') AS method,
      ppc.obs AS obs
    FROM path_pair_counts ppc
    INNER JOIN prefix_uniq su ON su.region = ppc.region AND su.w = ppc.hash_size AND su.prefix = ppc.src_prefix AND su.n = 1
    INNER JOIN prefix_uniq du ON du.region = ppc.region AND du.w = ppc.hash_size AND du.prefix = ppc.dst_prefix AND du.n = 1
  ),
  -- anchor-gateway: the uploading gateway (full key) heard the last hop. Aggregate (gateway, last_prefix)
  -- first, then accept iff exactly one in-region repeater with that prefix is within 150 km of the gateway.
  last_hop_counts AS (
    SELECT region, hash_size, gateway_key, last_prefix, count() AS obs
    FROM (
      SELECT
        multiIf(lower(topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(topic))[2]), '') AS region,
        hash_size, hex(origin_pubkey) AS gateway_key,
        substring(path, 2*hash_size*(hop_count-1)+1, 2*hash_size) AS last_prefix
      FROM meshcore_packets
      WHERE ingest_timestamp >= now() - INTERVAL 7 DAY
        AND hash_size_code != 3 AND hash_size != 0 AND route_type IN (0, 1) AND hop_count >= 1
    )
    WHERE region != ''
    GROUP BY region, hash_size, gateway_key, last_prefix
  ),
  edges_anchor_gw AS (
    SELECT lhc.region AS region, lhc.gateway_key AS source_node, any(R.public_key) AS target_node,
      'anchor-gateway' AS method, any(lhc.obs) AS obs
    FROM last_hop_counts lhc
    INNER JOIN node_details g ON g.public_key = lhc.gateway_key AND g.loc_ok
    INNER JOIN repeaters_loc R ON R.region = lhc.region AND substring(R.public_key, 1, 2*lhc.hash_size) = lhc.last_prefix
      AND R.public_key != lhc.gateway_key AND greatCircleDistance(R.lon, R.lat, g.lon, g.lat) <= 206000
    GROUP BY lhc.region, lhc.gateway_key, lhc.hash_size, lhc.last_prefix
    HAVING count() = 1
  ),
  -- anchor-origin: an advert's originator (full key from the payload) was heard by the first hop.
  advert_first_counts AS (
    SELECT region, hash_size, origin_key, first_prefix, count() AS obs
    FROM (
      SELECT
        multiIf(lower(topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(topic))[2]), '') AS region,
        hash_size, hex(substring(payload, 1, 32)) AS origin_key, substring(path, 1, 2*hash_size) AS first_prefix
      FROM meshcore_packets
      WHERE payload_type = 4 AND ingest_timestamp >= now() - INTERVAL 7 DAY
        AND hash_size_code != 3 AND hash_size != 0 AND route_type IN (0, 1) AND hop_count >= 1
    )
    WHERE region != ''
    GROUP BY region, hash_size, origin_key, first_prefix
  ),
  edges_anchor_origin AS (
    SELECT afc.region AS region, afc.origin_key AS source_node, any(R.public_key) AS target_node,
      'anchor-origin' AS method, any(afc.obs) AS obs
    FROM advert_first_counts afc
    INNER JOIN node_details o ON o.public_key = afc.origin_key AND o.loc_ok
    INNER JOIN repeaters_loc R ON R.region = afc.region AND substring(R.public_key, 1, 2*afc.hash_size) = afc.first_prefix
      AND R.public_key != afc.origin_key AND greatCircleDistance(R.lon, R.lat, o.lon, o.lat) <= 206000
    GROUP BY afc.region, afc.origin_key, afc.hash_size, afc.first_prefix
    HAVING count() = 1
  ),
  -- Direct connections (path_len = 0 adverts): gateway heard the advertiser with no intermediate hops.
  direct_connections AS (
    SELECT
      multiIf(lower(topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(topic))[2]), '') AS region,
      hex(origin_pubkey) AS source_node, public_key AS target_node, count() AS obs
    FROM meshcore_adverts
    WHERE path_len = 0 AND hex(origin_pubkey) != public_key AND ingest_timestamp >= now() - INTERVAL 7 DAY
    GROUP BY region, source_node, target_node
  ),
  all_edges AS (
    SELECT region, source_node, target_node, method, obs,
      multiIf(method = 'direct', 0, method LIKE 'anchor-%', 1, method = 'path-uniq-3b', 1, method = 'path-uniq-2b', 2, 3) AS rank
    FROM (
      SELECT region, source_node, target_node, method, obs FROM edges_path_uniq
      UNION ALL SELECT region, source_node, target_node, method, obs FROM edges_anchor_gw
      UNION ALL SELECT region, source_node, target_node, method, obs FROM edges_anchor_origin
      UNION ALL SELECT region, source_node, target_node, 'direct' AS method, obs FROM direct_connections
    )
  ),
  -- Canonicalize undirected and merge across methods/observations: best (lowest-rank) method wins.
  edge_consensus AS (
    SELECT region, a AS source_node, b AS target_node,
      argMin(method, rank) AS method, min(rank) AS best_rank, sum(obs) AS observation_count
    FROM (
      SELECT region, method, obs, rank,
        least(source_node, target_node) AS a, greatest(source_node, target_node) AS b
      FROM all_edges
      WHERE source_node != target_node AND source_node != '' AND target_node != '' AND region != ''
    )
    GROUP BY region, a, b
  )
SELECT
  ec.region AS region,
  ec.source_node AS source_node,
  ec.target_node AS target_node,
  -- back-compat connection_type: only a path_len=0 advert is a literal MQTT-direct edge; anchors
  -- are single-hop but inferred, so they group with 'path'. Fine-grained tier is in `method`.
  if(ec.method = 'direct', 'direct', 'path') AS connection_type,
  ec.method AS method,
  -- tier base (direct 1.0 .. path-uniq-1b 0.4) plus a small capped consensus bonus
  least(1.0, greatest(0.0, (1.0 - 0.2 * ec.best_rank) + least(0.08, 0.04 * log10(ec.observation_count + 1)))) AS confidence,
  ec.observation_count AS observation_count,
  ec.observation_count AS packet_count,
  sd.node_name AS source_name,
  if(sd.loc_ok, sd.lat, NULL) AS source_latitude,
  if(sd.loc_ok, sd.lon, NULL) AS source_longitude,
  toUInt8(sd.loc_ok) AS source_has_location,
  sd.last_seen AS source_last_seen,
  td.node_name AS target_name,
  if(td.loc_ok, td.lat, NULL) AS target_latitude,
  if(td.loc_ok, td.lon, NULL) AS target_longitude,
  toUInt8(td.loc_ok) AS target_has_location,
  td.last_seen AS target_last_seen
FROM edge_consensus AS ec
INNER JOIN node_details AS sd ON ec.source_node = sd.public_key
INNER JOIN node_details AS td ON ec.target_node = td.public_key
-- Backstop: drop geographically implausible adjacencies between two located nodes (a single LoRa
-- hop beyond MAX_HOP / 206 km is not realistic and indicates a hash-collision false positive).
WHERE NOT (sd.loc_ok AND td.loc_ok AND greatCircleDistance(sd.lon, sd.lat, td.lon, td.lat) > 206000);
-- +goose StatementEnd

SYSTEM REFRESH VIEW meshcore_all_neighbor_edges;


-- +goose Down
-- Restore the migration-004 neighbor edge graph (1-byte hops, prefix-uniqueness only, no
-- method/confidence columns).
DROP VIEW IF EXISTS meshcore_all_neighbor_edges;
-- +goose StatementBegin
CREATE MATERIALIZED VIEW IF NOT EXISTS meshcore_all_neighbor_edges
REFRESH EVERY 1 HOUR
ENGINE = MergeTree
ORDER BY (region, source_node, target_node)
AS
WITH
  node_details AS (
    SELECT
      public_key,
      node_name,
      last_seen,
      ifNull(latitude, 0.) AS lat,
      ifNull(longitude, 0.) AS lon,
      (has_location AND abs(ifNull(latitude, 0.)) > 0.01 AND abs(ifNull(longitude, 0.)) > 0.01) AS loc_ok
    FROM meshcore_adverts_latest
  ),
  adverts_latest_r AS (
    SELECT
      public_key,
      is_repeater,
      last_seen,
      multiIf(lower(topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(topic))[2]), '') AS region
    FROM meshcore_adverts_latest
  ),
  repeater_prefixes AS (
    SELECT
      region,
      substring(public_key, 1, 2) AS prefix,
      count() AS node_count,
      any(public_key) AS representative_key
    FROM adverts_latest_r
    WHERE is_repeater = 1 AND last_seen >= now() - INTERVAL 2 DAY AND region != ''
    GROUP BY region, prefix
    HAVING node_count = 1
  ),
  path_src AS (
    SELECT DISTINCT
      payload,
      path,
      path_len,
      multiIf(lower(topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(topic))[2]), '') AS region
    FROM meshcore_packets
    WHERE path_len >= 2 AND ingest_timestamp >= now() - INTERVAL 1 DAY
  ),
  path_pairs AS (
    SELECT DISTINCT
      region,
      payload,
      upper(substring(path, 2 * i - 1, 2)) AS source_prefix,
      upper(substring(path, 2 * i + 1, 2)) AS target_prefix
    FROM path_src
    ARRAY JOIN range(1, path_len) AS i
    WHERE i < path_len AND region != ''
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
  direct_connections AS (
    SELECT DISTINCT
      multiIf(lower(topic) IN ('meshcore','meshcore/salish'), 'SEA', match(splitByChar('/', lower(topic))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(topic))[2]), '') AS region,
      hex(origin_pubkey) AS source_node,
      public_key AS target_node
    FROM meshcore_adverts
    WHERE path_len = 0
      AND hex(origin_pubkey) != public_key
      AND ingest_timestamp >= now() - INTERVAL 7 DAY
  ),
  edges AS (
    SELECT region, source_node, target_node, 'path' AS connection_type, packet_count
    FROM path_connections
    UNION ALL
    SELECT d.region, d.source_node, d.target_node, 'direct' AS connection_type, CAST(1 AS UInt64) AS packet_count
    FROM direct_connections AS d
    WHERE d.region != ''
      AND (d.region, d.source_node, d.target_node) NOT IN (SELECT region, source_node, target_node FROM path_connections)
      AND (d.region, d.target_node, d.source_node) NOT IN (SELECT region, source_node, target_node FROM path_connections)
  )
SELECT
  e.region AS region,
  e.source_node AS source_node,
  e.target_node AS target_node,
  e.connection_type AS connection_type,
  e.packet_count AS packet_count,
  sd.node_name AS source_name,
  if(sd.loc_ok, sd.lat, NULL) AS source_latitude,
  if(sd.loc_ok, sd.lon, NULL) AS source_longitude,
  toUInt8(sd.loc_ok) AS source_has_location,
  sd.last_seen AS source_last_seen,
  td.node_name AS target_name,
  if(td.loc_ok, td.lat, NULL) AS target_latitude,
  if(td.loc_ok, td.lon, NULL) AS target_longitude,
  toUInt8(td.loc_ok) AS target_has_location,
  td.last_seen AS target_last_seen
FROM edges AS e
INNER JOIN node_details AS sd ON e.source_node = sd.public_key
INNER JOIN node_details AS td ON e.target_node = td.public_key
WHERE NOT (sd.loc_ok AND td.loc_ok AND greatCircleDistance(sd.lon, sd.lat, td.lon, td.lat) > 150000);
-- +goose StatementEnd

SYSTEM REFRESH VIEW meshcore_all_neighbor_edges;
