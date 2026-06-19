"use server";
import { clickhouse } from "./clickhouse";
import { generateRegionWhereClause } from "@/lib/regionFilters";
import { regionFromTopic, normalizeRegion, groupCodeOf } from "@/lib/regions";
import { publicChannelMessagesSubquery } from "./chatMessages";
import { isHiddenNodeName, visibleNodeSqlClause } from "@/lib/node-privacy";

export async function getNodePositions({ minLat, maxLat, minLng, maxLng, nodeTypes, lastSeen }: { minLat?: string | null, maxLat?: string | null, minLng?: string | null, maxLng?: string | null, nodeTypes?: string[], lastSeen?: string | null } = {}) {
  try {
    let where = [
      "latitude IS NOT NULL",
      "longitude IS NOT NULL",
      // Exclude the (0,0) "null island" sentinel (location bit set but no real GPS fix)
      "(abs(latitude) > 0.01 OR abs(longitude) > 0.01)",
      // Node privacy: hide nodes whose name carries an opt-out emoji.
      visibleNodeSqlClause("name")
    ];
    const params: Record<string, any> = {};
    if (minLat !== null && minLat !== undefined && minLat !== "") {
      where.push(`latitude >= {minLat:Float64}`);
      params.minLat = Number(minLat);
    }
    if (maxLat !== null && maxLat !== undefined && maxLat !== "") {
      where.push(`latitude <= {maxLat:Float64}`);
      params.maxLat = Number(maxLat);
    }
    if (minLng !== null && minLng !== undefined && minLng !== "") {
      where.push(`longitude >= {minLng:Float64}`);
      params.minLng = Number(minLng);
    }
    if (maxLng !== null && maxLng !== undefined && maxLng !== "") {
      where.push(`longitude <= {maxLng:Float64}`);
      params.maxLng = Number(maxLng);
    }
    if (nodeTypes && nodeTypes.length > 0) {
      where.push(`type IN {nodeTypes:Array(String)}`);
      params.nodeTypes = nodeTypes;
    }
    if (lastSeen !== null && lastSeen !== undefined && lastSeen !== "") {
      where.push(`last_seen >= now() - INTERVAL {lastSeen:UInt32} SECOND`);
      params.lastSeen = Number(lastSeen);
    }
    const query = `SELECT node_id, name, short_name, latitude, longitude, last_seen, first_seen, type FROM unified_latest_nodeinfo WHERE ${where.join(" AND ")}`;
    const resultSet = await clickhouse.query({ query, query_params: params, format: 'JSONEachRow' });
    const rows = await resultSet.json();
    return rows as Array<{
      node_id: string;
      name?: string | null;
      short_name?: string | null;
      latitude: number;
      longitude: number;
      last_seen: string;
      first_seen?: string;
      type: string;
    }>;
  } catch (error) {
    console.error('ClickHouse error in getNodePositions:', error);
    throw error;
  }
} 

export async function getLatestChatMessages({ limit = 20, before, after, channelId, region }: { limit?: number, before?: string, after?: string, channelId?: string, region?: string } = {}) {
  try {
    // Filters that can be pushed into the inner meshcore_packets scan so the
    // ingest_timestamp primary key / partition pruning applies. See
    // publicChannelMessagesSubquery for why this avoids a full-history scan.
    const innerWhere: string[] = [];
    const params: Record<string, any> = { limit };

    // Inner-scan columns must be table-qualified: unqualified, the analyzer binds
    // them to the aggregate output aliases (max(ingest_timestamp) etc.) and rejects
    // the WHERE (ILLEGAL_AGGREGATION). Qualified, they push onto the decoded table's
    // (channel_hash, ingest_timestamp) primary key before the GROUP BY message_id.
    if (before) {
      innerWhere.push('meshcore_public_channel_messages_raw.ingest_timestamp < {before:DateTime64}');
      params.before = before;
    }
    if (after) {
      innerWhere.push('meshcore_public_channel_messages_raw.ingest_timestamp > {after:DateTime64}');
      params.after = after;
    }
    if (channelId) {
      innerWhere.push('meshcore_public_channel_messages_raw.channel_hash = {channelId:String}');
      params.channelId = channelId;
    }

    // Region filter pushes onto the raw table's stored `region` column (derived identically to
    // regionSql) BEFORE the GROUP BY, so unmatched rows are pruned at the scan instead of via a
    // post-aggregation arrayExists over origin_path_info. Table-qualify the column so it binds to
    // the scan, not the aggregate output. '__ALL__'/unset/unknown -> no filter (empty clause).
    const regionFilter = generateRegionWhereClause(region, "meshcore_public_channel_messages_raw");
    if (regionFilter.whereClause) {
      innerWhere.push(regionFilter.whereClause);
    }

    const query = `SELECT ingest_timestamp, mesh_timestamp, channel_hash, mac, hex(encrypted_message) AS encrypted_message, message_count, origin_path_info, hash_size, message_id FROM ${publicChannelMessagesSubquery(innerWhere)} ORDER BY ingest_timestamp DESC LIMIT {limit:UInt32}`;
    const resultSet = await clickhouse.query({ query, query_params: params, format: 'JSONEachRow' });
    const rows = await resultSet.json();
    return rows as Array<{
      ingest_timestamp: string;
      mesh_timestamp: string;
      channel_hash: string;
      mac: string;
      encrypted_message: string;
      message_count: number;
      origin_path_info: Array<[string, string, string, string, string]>; // Array of [origin, origin_pubkey, path, broker, topic] tuples
      hash_size: number; // bytes per path hop (1/2/3); used to split path into hops
      message_id: string;
    }>;
  } catch (error) {
    console.error('ClickHouse error in getLatestChatMessages:', error);
    throw error;
  }
}

/**
 * Determines the region based on broker and topic information
 * @param broker Broker string
 * @param topic Topic string
 * @returns The detected region name or null if no region matches
 */
// Region detection functions moved to regionFilters.ts

export async function getMeshcoreNodeInfo(publicKey: string, limit: number = 50) {
  try {
    // Get basic node info from the latest advert and first seen time
    const nodeInfoQuery = `
      SELECT 
        public_key,
        argMax(node_name, ingest_timestamp) as node_name,
        argMax(latitude, ingest_timestamp) as latitude,
        argMax(longitude, ingest_timestamp) as longitude,
        argMax(has_location, ingest_timestamp) as has_location,
        argMax(is_repeater, ingest_timestamp) as is_repeater,
        argMax(is_chat_node, ingest_timestamp) as is_chat_node,
        argMax(is_room_server, ingest_timestamp) as is_room_server,
        argMax(has_name, ingest_timestamp) as has_name,
        argMax(broker, ingest_timestamp) as broker,
        argMax(topic, ingest_timestamp) as topic,
        max(ingest_timestamp) as last_seen,
        min(ingest_timestamp) as first_seen
      FROM meshcore_adverts 
      WHERE public_key = {publicKey:String}
      GROUP BY public_key
      LIMIT 1
    `;
    
    const nodeInfoResult = await clickhouse.query({ 
      query: nodeInfoQuery, 
      query_params: { publicKey }, 
      format: 'JSONEachRow' 
    });
    const nodeInfo = await nodeInfoResult.json() as Array<{
      public_key: string;
      node_name: string;
      latitude: number | null;
      longitude: number | null;
      has_location: number;
      is_repeater: number;
      is_chat_node: number;
      is_room_server: number;
      has_name: number;
      broker: string | null;
      topic: string | null;
      last_seen: string;
      first_seen: string;
    }>;
    
    if (!nodeInfo || nodeInfo.length === 0) {
      return null;
    }

    // Node privacy: a node that opted out via its name is treated as not found.
    if (isHiddenNodeName(nodeInfo[0].node_name)) {
      return null;
    }

    // Get recent adverts grouped by adv_timestamp with origin_path_pubkey tuples
    const advertsQuery = `
      SELECT 
        argMax(adv_timestamp, ingest_timestamp) as adv_timestamp,
        groupArray((origin, path, origin_pubkey)) as origin_path_pubkey_tuples,
        count() as advert_count,
        min(ingest_timestamp) as earliest_timestamp,
        max(ingest_timestamp) as latest_timestamp,
        argMax(latitude, ingest_timestamp) as latitude,
        argMax(longitude, ingest_timestamp) as longitude,
        argMax(is_repeater, ingest_timestamp) as is_repeater,
        argMax(is_chat_node, ingest_timestamp) as is_chat_node,
        argMax(is_room_server, ingest_timestamp) as is_room_server,
        argMax(has_location, ingest_timestamp) as has_location,
        any(hash_size) as hash_size,
        packet_hash
      FROM (
        SELECT
          ingest_timestamp,
          mesh_timestamp,
          adv_timestamp,
          hex(path) as path,
          path_len,
          hash_size,
          latitude,
          longitude,
          is_repeater,
          is_chat_node,
          is_room_server,
          has_location,
          hex(origin_pubkey) as origin_pubkey,
          origin,
          packet_hash
        FROM meshcore_adverts 
        WHERE public_key = {publicKey:String}
        ORDER BY ingest_timestamp DESC
      )
      GROUP BY packet_hash
      ORDER BY max(ingest_timestamp) DESC
      LIMIT {limit:UInt32}
    `;
    
    const advertsResult = await clickhouse.query({ 
      query: advertsQuery, 
      query_params: { publicKey, limit }, 
      format: 'JSONEachRow' 
    });
    const adverts = await advertsResult.json();
    
    // Get location history (unique locations over time) - last 30 days only
    const locationHistoryQuery = `
      SELECT 
        mesh_timestamp,
        latitude,
        longitude
      FROM (
        SELECT 
          mesh_timestamp,
          latitude,
          longitude,
          row_number() OVER (PARTITION BY round(latitude, 6), round(longitude, 6) ORDER BY mesh_timestamp DESC) as rn
        FROM meshcore_adverts 
        WHERE public_key = {publicKey:String}
          AND latitude IS NOT NULL 
          AND longitude IS NOT NULL
          AND mesh_timestamp >= now() - INTERVAL 30 DAY
      ) 
      WHERE rn = 1
      ORDER BY mesh_timestamp DESC 
      LIMIT 100
    `;
    
    const locationResult = await clickhouse.query({ 
      query: locationHistoryQuery, 
      query_params: { publicKey }, 
      format: 'JSONEachRow' 
    });
    const locationHistory = await locationResult.json();
    
    // Check MQTT uplink status and last packet time per topic
    const mqttQuery = `
      SELECT 
        topic,
        broker,
        max(ingest_timestamp) as last_packet_time,
        max(ingest_timestamp) >= now() - INTERVAL 7 DAY as is_recent
      FROM meshcore_packets 
      WHERE hex(origin_pubkey) = {publicKey:String}
      GROUP BY topic, broker
      ORDER BY last_packet_time DESC
    `;
    
    const mqttResult = await clickhouse.query({ 
      query: mqttQuery, 
      query_params: { publicKey }, 
      format: 'JSONEachRow' 
    });
    const mqttTopics = await mqttResult.json() as Array<{
      topic: string;
      broker: string;
      last_packet_time: string;
      is_recent: boolean;
    }>;
    
    // Calculate overall MQTT status
    const hasPackets = mqttTopics.length > 0;
    const isUplinked = mqttTopics.some(topic => topic.is_recent);
    
    // Derive the node's region from its most recent uplink topic (else its latest advert topic).
    const detectedRegion = regionFromTopic(mqttTopics[0]?.topic ?? nodeInfo[0].topic);
    
    return {
      node: nodeInfo[0],
      recentAdverts: adverts,
      locationHistory: locationHistory,
      mqtt: {
        is_uplinked: isUplinked,
        has_packets: hasPackets,
        topics: mqttTopics
      },
      region: detectedRegion
    };
  } catch (error) {
    console.error('ClickHouse error in getMeshcoreNodeInfo:', error);
    throw error;
  }
}

export async function getAllNodeNeighbors(lastSeen: string | null = null, minLat?: string | null, maxLat?: string | null, minLng?: string | null, maxLng?: string | null, nodeTypes?: string[], region?: string) {
  try {
    // Reads the precomputed (hourly-refreshed) neighbor edge graph and filters it
    // by region + bounding box + lastSeen. The heavy graph computation lives in the
    // refreshable materialized view meshcore_all_neighbor_edges.
    // Region filter for the precomputed neighbor graph: a region selector -> that region; a group
    // selector -> its member regions (resolved in-DB against region_groups); else default to SEA.
    // The MV only holds intra-region edges, so a group never produces cross-region neighbors.
    const params: Record<string, any> = {};
    const nbrCode = normalizeRegion(region);
    const nbrGroup = groupCodeOf(region);
    let nbrRegionFilter: string;
    if (nbrCode) { nbrRegionFilter = "region = {region:String}"; params.region = nbrCode; }
    else if (nbrGroup) { nbrRegionFilter = "region IN (SELECT region_code FROM region_groups WHERE group_code = {grp:String})"; params.grp = nbrGroup; }
    else { nbrRegionFilter = "region = {region:String}"; params.region = "SEA"; }
    const whereConditions = [
      nbrRegionFilter,
      "source_has_location = 1",
      "target_has_location = 1",
      "source_latitude IS NOT NULL",
      "source_longitude IS NOT NULL",
      "target_latitude IS NOT NULL",
      "target_longitude IS NOT NULL",
      // Node privacy: drop the edge if either endpoint opted out via its name.
      visibleNodeSqlClause("source_name"),
      visibleNodeSqlClause("target_name"),
    ];

    // Bounding box: both endpoints must be within view (matches the old visible_nodes behavior)
    if (minLat !== null && minLat !== undefined && minLat !== "") {
      whereConditions.push("source_latitude >= {minLat:Float64} AND target_latitude >= {minLat:Float64}");
      params.minLat = Number(minLat);
    }
    if (maxLat !== null && maxLat !== undefined && maxLat !== "") {
      whereConditions.push("source_latitude <= {maxLat:Float64} AND target_latitude <= {maxLat:Float64}");
      params.maxLat = Number(maxLat);
    }
    if (minLng !== null && minLng !== undefined && minLng !== "") {
      whereConditions.push("source_longitude >= {minLng:Float64} AND target_longitude >= {minLng:Float64}");
      params.minLng = Number(minLng);
    }
    if (maxLng !== null && maxLng !== undefined && maxLng !== "") {
      whereConditions.push("source_longitude <= {maxLng:Float64} AND target_longitude <= {maxLng:Float64}");
      params.maxLng = Number(maxLng);
    }
    if (lastSeen !== null && lastSeen !== undefined && lastSeen !== "") {
      whereConditions.push("source_last_seen >= now() - INTERVAL {lastSeen:UInt32} SECOND AND target_last_seen >= now() - INTERVAL {lastSeen:UInt32} SECOND");
      params.lastSeen = Number(lastSeen);
    }

    const allNeighborsQuery = `
      SELECT
        source_node,
        target_node,
        connection_type,
        packet_count,
        source_name,
        source_latitude,
        source_longitude,
        source_has_location,
        target_name,
        target_latitude,
        target_longitude,
        target_has_location
      FROM meshcore_all_neighbor_edges
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY connection_type, source_node, target_node
    `;
    
    const neighborsResult = await clickhouse.query({ 
      query: allNeighborsQuery, 
      query_params: params, 
      format: 'JSONEachRow' 
    });
    const neighbors = await neighborsResult.json();
    
    return neighbors as Array<{
      source_node: string;
      target_node: string;
      connection_type: string;
      packet_count: number;
      source_name: string;
      source_latitude: number;
      source_longitude: number;
      source_has_location: number;
      target_name: string;
      target_latitude: number;
      target_longitude: number;
      target_has_location: number;
    }>;
  } catch (error) {
    console.error('ClickHouse error in getAllNodeNeighbors:', error);
    throw error;
  }
}

export async function getMeshcoreNodeNeighbors(publicKey: string, lastSeen: string | null = null) {
  try {
    // Reads the precomputed (hourly-refreshed) per-node direct adjacency from the
    // refreshable materialized view meshcore_node_direct_neighbors.
    const params: Record<string, any> = { publicKey };
    const whereConditions = [
      "node_public_key = {publicKey:String}",
      // Node privacy: hide neighbors that opted out via their name.
      visibleNodeSqlClause("neighbor_name"),
    ];
    if (lastSeen !== null) {
      whereConditions.push("neighbor_last_seen >= now() - INTERVAL {lastSeen:UInt32} SECOND");
      params.lastSeen = Number(lastSeen);
    }

    const neighborsQuery = `
      SELECT
        neighbor_public_key AS public_key,
        any(neighbor_name) AS node_name,
        any(neighbor_latitude) AS latitude,
        any(neighbor_longitude) AS longitude,
        any(neighbor_has_location) AS has_location,
        any(neighbor_is_repeater) AS is_repeater,
        any(neighbor_is_chat_node) AS is_chat_node,
        any(neighbor_is_room_server) AS is_room_server,
        any(neighbor_has_name) AS has_name,
        groupUniqArray(direction) AS directions
      FROM meshcore_node_direct_neighbors
      WHERE ${whereConditions.join(" AND ")}
      GROUP BY neighbor_public_key
      ORDER BY neighbor_public_key
    `;
    
    const neighborsResult = await clickhouse.query({ 
      query: neighborsQuery, 
      query_params: params, 
      format: 'JSONEachRow' 
    });
    const neighbors = await neighborsResult.json();
    
    return neighbors as Array<{
      public_key: string;
      node_name: string;
      latitude: number | null;
      longitude: number | null;
      has_location: number;
      is_repeater: number;
      is_chat_node: number;
      is_room_server: number;
      has_name: number;
      directions: string[];
    }>;
  } catch (error) {
    console.error('ClickHouse error in getMeshcoreNodeNeighbors:', error);
    throw error;
  }
}

interface SearchQuery {
  query?: string;
  region?: string;
  lastSeen?: string | null;
  limit?: number;
  exact?: boolean;
  is_repeater?: boolean;
}

export async function searchMeshcoreNodes(searchParams: SearchQuery | SearchQuery[] = {}) {
  try {
    // Normalize input to array format
    const queries = Array.isArray(searchParams) ? searchParams : [searchParams];
    
    // If no queries or empty array, return empty results
    if (queries.length === 0) {
      return [];
    }
    
    // Build a per-query branch condition plus its limit. Instead of emitting one
    // UNION ALL branch per query (each of which re-merges the entire
    // meshcore_adverts_latest_state AggregatingMergeTree), we scan/merge the
    // meshcore_adverts_latest view exactly ONCE and fan each surviving row out to
    // every branch it matches via arrayJoin, then rank per branch with a window
    // function. Per-query branch predicates are heterogeneous (name vs public_key,
    // exact vs prefix/substring, plus independent region/lastSeen/is_repeater
    // filters), so each branch keeps its own boolean expression.
    const branchConditions: string[] = [];
    const branchLimits: number[] = [];
    const allParams: Record<string, any> = {};

    queries.forEach((searchQuery, index) => {
      const {
        query: searchString,
        region,
        lastSeen,
        limit = 50,
        exact = false,
        is_repeater
      } = searchQuery;

      // Node privacy: hidden nodes are unsearchable.
      const where: string[] = [visibleNodeSqlClause("node_name")];
      const queryParams: Record<string, any> = {};

      // Add search conditions
      if (searchString && searchString.trim()) {
        const trimmedQuery = searchString.trim();

        // Check if it looks like a public key (hex string)
        if (/^[0-9A-Fa-f]+$/.test(trimmedQuery)) {
          if (exact) {
            // Exact public key match
            where.push(`public_key = {publicKeyExact_${index}:String}`);
            queryParams[`publicKeyExact_${index}`] = trimmedQuery.toUpperCase();
          } else {
            // Search by public key prefix
            where.push(`public_key LIKE {publicKeyPattern_${index}:String}`);
            queryParams[`publicKeyPattern_${index}`] = `${trimmedQuery.toUpperCase()}%`;
          }
        } else {
          if (exact) {
            // Exact node name match (case insensitive)
            where.push(`lower(node_name) = {nameExact_${index}:String}`);
            queryParams[`nameExact_${index}`] = trimmedQuery.toLowerCase();
          } else {
            // Search by node name (case insensitive, anywhere in the name)
            where.push(`lower(node_name) LIKE {namePattern_${index}:String}`);
            queryParams[`namePattern_${index}`] = `%${trimmedQuery.toLowerCase()}%`;
          }
        }
      }

      // Add lastSeen filter if provided
      if (lastSeen !== null && lastSeen !== undefined && lastSeen !== "") {
        where.push(`last_seen >= now() - INTERVAL {lastSeen_${index}:UInt32} SECOND`);
        queryParams[`lastSeen_${index}`] = Number(lastSeen);
      }

      // Add region filtering if specified
      const regionFilter = generateRegionWhereClause(region);
      if (regionFilter.whereClause) {
        where.push(regionFilter.whereClause);
      }

      // Add is_repeater filter if specified
      if (is_repeater !== undefined) {
        where.push(`is_repeater = {isRepeater_${index}:UInt8}`);
        queryParams[`isRepeater_${index}`] = is_repeater ? 1 : 0;
      }

      // A branch with no predicates matches every row (preserves the previous
      // behavior where an empty WHERE returned the whole table for that query).
      branchConditions.push(where.length > 0 ? `(${where.join(' AND ')})` : '1');
      branchLimits.push(limit);

      // Add query params to the global params object
      Object.assign(allParams, queryParams);
    });

    // The single scan only needs rows matching at least one branch.
    const combinedFilter = branchConditions.some((c) => c === '1')
      ? '1'
      : branchConditions.join(' OR ');

    // Per-branch match flags drive the arrayJoin fan-out: each row is emitted once
    // per branch it satisfies (query_index = that branch; -1 for non-matching
    // branches, filtered out below). We then rank within each branch by last_seen
    // and keep up to the largest requested limit (exact per-branch limits are
    // applied in TS below, since limits can differ per branch).
    const matchFlags = branchConditions
      .map((cond, index) => `if(${cond}, ${index}, -1)`)
      .join(', ');
    const maxLimit = branchLimits.length > 0 ? Math.max(...branchLimits) : 0;

    // Reads the live, state-backed meshcore_adverts_latest view (incremental MV over
    // meshcore_adverts_latest_state) once. All filter columns (public_key, node_name,
    // last_seen, region, is_repeater) exist on the view, so the WHERE pushes straight
    // onto it. The state table is merged a single time regardless of branch count.
    const finalQuery = `
      SELECT
        public_key,
        node_name,
        latitude,
        longitude,
        has_location,
        is_repeater,
        is_chat_node,
        is_room_server,
        has_name,
        first_heard,
        last_seen,
        broker,
        topic,
        query_index
      FROM (
        SELECT
          *,
          row_number() OVER (PARTITION BY query_index ORDER BY last_seen DESC) AS rn
        FROM (
          SELECT
            public_key,
            node_name,
            latitude,
            longitude,
            has_location,
            is_repeater,
            is_chat_node,
            is_room_server,
            has_name,
            first_heard,
            last_seen,
            broker,
            topic,
            arrayJoin([${matchFlags}]) AS query_index
          FROM meshcore_adverts_latest
          WHERE ${combinedFilter}
        )
        WHERE query_index >= 0
      )
      WHERE rn <= {maxLimit:UInt32}
      ORDER BY query_index ASC, last_seen DESC
    `;
    allParams['maxLimit'] = maxLimit;

    const resultSet = await clickhouse.query({
      query: finalQuery,
      query_params: allParams,
      format: 'JSONEachRow'
    });
    const rows = await resultSet.json();
    
    type SearchResult = {
      public_key: string;
      node_name: string;
      latitude: number | null;
      longitude: number | null;
      has_location: number;
      is_repeater: number;
      is_chat_node: number;
      is_room_server: number;
      has_name: number;
      first_heard: string;
      last_seen: string;
      broker: string;
      topic: string;
      query_index?: number;
    };
    
    // Group results by query_index. Rows arrive ordered by (query_index, last_seen
    // DESC) and pre-trimmed to at most maxLimit per branch by the window function;
    // we slice to each branch's exact limit here since branch limits can differ.
    const groupedResults = (rows as SearchResult[]).reduce((acc, row) => {
      const index = row.query_index || 0;
      if (!acc[index]) {
        acc[index] = [];
      }
      const { query_index, ...result } = row;
      if (acc[index].length < branchLimits[index]) {
        acc[index].push(result);
      }
      return acc;
    }, {} as Record<number, SearchResult[]>);

    // If single query, return its results without query_index
    if (!Array.isArray(searchParams)) {
      return groupedResults[0] || [];
    }

    // Return results in the same order as input queries
    return queries.map((_, index) => groupedResults[index] || []);
  } catch (error) {
    console.error('ClickHouse error in searchMeshcoreNodes:', error);
    throw error;
  }
} 