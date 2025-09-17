"use server";
import { clickhouse } from "./clickhouse";
import { generateRegionWhereClauseFromArray, generateRegionWhereClause, detectRegionFromBrokerTopic, detectRegion } from "@/lib/regionFilters";
import { getRegionConfig } from "@/lib/regions";

export async function getNodePositions({ minLat, maxLat, minLng, maxLng, nodeTypes, lastSeen }: { minLat?: string | null, maxLat?: string | null, minLng?: string | null, maxLng?: string | null, nodeTypes?: string[], lastSeen?: string | null } = {}) {
  try {
    let where = [
      "latitude IS NOT NULL",
      "longitude IS NOT NULL"
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
    let where = [];
    const params: Record<string, any> = { limit };
    
    if (before) {
      where.push('ingest_timestamp < {before:DateTime64}');
      params.before = before;
    }
    if (after) {
      where.push('ingest_timestamp > {after:DateTime64}');
      params.after = after;
    }
    if (channelId) {
      where.push('channel_hash = {channelId:String}');
      params.channelId = channelId;
    }
    
    // Add region filtering if specified
    const regionFilter = generateRegionWhereClauseFromArray(region);
    if (regionFilter.whereClause) {
      where.push(regionFilter.whereClause);
    }
    
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    const query = `SELECT ingest_timestamp, mesh_timestamp, channel_hash, mac, hex(encrypted_message) AS encrypted_message, message_count, origin_path_info, message_id FROM meshcore_public_channel_messages ${whereClause} ORDER BY ingest_timestamp DESC LIMIT {limit:UInt32}`;
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
    
    // Get recent adverts grouped by adv_timestamp with origin_path_pubkey tuples
    const advertsQuery = `
      SELECT 
        adv_timestamp,
        groupArray((origin, path, origin_pubkey)) as origin_path_pubkey_tuples,
        count() as advert_count,
        min(ingest_timestamp) as earliest_timestamp,
        max(ingest_timestamp) as latest_timestamp,
        argMax(latitude, ingest_timestamp) as latitude,
        argMax(longitude, ingest_timestamp) as longitude,
        argMax(is_repeater, ingest_timestamp) as is_repeater,
        argMax(is_chat_node, ingest_timestamp) as is_chat_node,
        argMax(is_room_server, ingest_timestamp) as is_room_server,
        argMax(has_location, ingest_timestamp) as has_location
      FROM (
        SELECT 
          ingest_timestamp,
          mesh_timestamp,
          adv_timestamp,
          hex(path) as path,
          path_len,
          latitude,
          longitude,
          is_repeater,
          is_chat_node,
          is_room_server,
          has_location,
          hex(origin_pubkey) as origin_pubkey,
          origin
        FROM meshcore_adverts 
        WHERE public_key = {publicKey:String}
        ORDER BY ingest_timestamp DESC
      )
      GROUP BY adv_timestamp
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
    
    // Detect region from MQTT topics and advert data
    const detectedRegion = detectRegion(mqttTopics, nodeInfo[0].broker, nodeInfo[0].topic);
    
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
    // Build where conditions for visible nodes
    let visibleNodeWhereConditions = [
      "latitude IS NOT NULL",
      "longitude IS NOT NULL"
    ];
    const params: Record<string, any> = {};
    
    // Add location bounds for visible nodes
    if (minLat !== null && minLat !== undefined && minLat !== "") {
      visibleNodeWhereConditions.push("latitude >= {minLat:Float64}");
      params.minLat = Number(minLat);
    }
    if (maxLat !== null && maxLat !== undefined && maxLat !== "") {
      visibleNodeWhereConditions.push("latitude <= {maxLat:Float64}");
      params.maxLat = Number(maxLat);
    }
    if (minLng !== null && minLng !== undefined && minLng !== "") {
      visibleNodeWhereConditions.push("longitude >= {minLng:Float64}");
      params.minLng = Number(minLng);
    }
    if (maxLng !== null && maxLng !== undefined && maxLng !== "") {
      visibleNodeWhereConditions.push("longitude <= {maxLng:Float64}");
      params.maxLng = Number(maxLng);
    }
    if (nodeTypes && nodeTypes.length > 0) {
      visibleNodeWhereConditions.push("type IN {nodeTypes:Array(String)}");
      params.nodeTypes = nodeTypes;
    }
    if (lastSeen !== null && lastSeen !== undefined && lastSeen !== "") {
      visibleNodeWhereConditions.push("last_seen >= now() - INTERVAL {lastSeen:UInt32} SECOND");
      params.lastSeen = Number(lastSeen);
    }

    // Build where conditions for meshcore adverts
    let meshcoreWhereConditions = [];
    if (lastSeen !== null && lastSeen !== undefined && lastSeen !== "") {
      meshcoreWhereConditions.push("ingest_timestamp >= now() - INTERVAL {lastSeen:UInt32} SECOND");
    }

    const meshcoreWhere = meshcoreWhereConditions.length > 0 ? `AND ${meshcoreWhereConditions.join(" AND ")}` : '';

    // Build region filtering for meshcore_packets
    const regionFilter = generateRegionWhereClause(region);
    const packetsRegionWhere = regionFilter.whereClause ? `AND ${regionFilter.whereClause}` : '';

    const allNeighborsQuery = `
      WITH visible_nodes AS (
        -- Get only nodes visible on the current map view
        SELECT 
          node_id,
          name,
          short_name,
          latitude,
          longitude,
          last_seen,
          first_seen,
          type
        FROM unified_latest_nodeinfo 
        WHERE ${visibleNodeWhereConditions.join(" AND ")}
      ),
      visible_node_details AS (
        -- Get latest attributes for visible nodes from meshcore_adverts
        SELECT 
          public_key,
          argMax(node_name, ingest_timestamp) as node_name,
          argMax(latitude, ingest_timestamp) as latitude,
          argMax(longitude, ingest_timestamp) as longitude,
          argMax(has_location, ingest_timestamp) as has_location,
          argMax(is_repeater, ingest_timestamp) as is_repeater,
          argMax(is_chat_node, ingest_timestamp) as is_chat_node,
          argMax(is_room_server, ingest_timestamp) as is_room_server,
          argMax(has_name, ingest_timestamp) as has_name
        FROM meshcore_adverts 
        WHERE public_key IN (SELECT node_id FROM visible_nodes)
          ${meshcoreWhere}
        GROUP BY public_key
      ),
      repeater_prefixes AS (
        -- Get repeater prefixes info, excluding collisions (multiple repeaters per prefix)
        -- Only include repeaters from the selected region
        SELECT 
          substring(public_key, 1, 2) as prefix,
          count() as node_count,
          any(public_key) as representative_key,
          any(node_name) as representative_name
        FROM meshcore_adverts_latest 
        WHERE is_repeater = 1 
          AND last_seen >= now() - INTERVAL 2 DAY
          ${regionFilter.whereClause ? `AND ${regionFilter.whereClause}` : ''}
        GROUP BY prefix
        HAVING node_count = 1  -- Only include prefixes with exactly one repeater
      ),
      direct_connections AS (
        -- Get all direct connections (path_len = 0) but only between visible nodes
        SELECT DISTINCT
          hex(origin_pubkey) as source_node,
          public_key as target_node,
          'direct' as connection_type,
          1 as packet_count  -- Direct connections don't have packet counts, use 1 as default
        FROM meshcore_adverts 
        WHERE path_len = 0
          AND hex(origin_pubkey) != public_key
          -- Only include connections where both nodes are visible
          AND hex(origin_pubkey) IN (SELECT node_id FROM visible_nodes)
          AND public_key IN (SELECT node_id FROM visible_nodes)
          ${meshcoreWhere}
      ),
      path_neighbors AS (
        -- Extract neighbors from routing paths with unique payload counts
        -- Group by payload first to avoid double counting same message propagation
        SELECT 
          source_prefix,
          target_prefix,
          'path' as connection_type,
          count() as packet_count
        FROM (
          SELECT DISTINCT
            payload,
            upper(hex(substring(path, i, 1))) as source_prefix,
            upper(hex(substring(path, i + 1, 1))) as target_prefix
          FROM (
            SELECT DISTINCT
              payload,
              path,
              path_len
            FROM meshcore_packets 
            WHERE path_len >= 2
              AND ingest_timestamp >= now() - INTERVAL 1 DAY
              ${packetsRegionWhere}
          ) p
          ARRAY JOIN range(1, path_len) as i
          WHERE i < path_len
        ) path_pairs
        WHERE source_prefix IN (SELECT prefix FROM repeater_prefixes)
          AND target_prefix IN (SELECT prefix FROM repeater_prefixes)
          AND source_prefix != target_prefix
        GROUP BY source_prefix, target_prefix
      ),
      prefix_to_key_map AS (
        -- Map prefixes back to full public keys for visible nodes
        SELECT 
          rp.prefix,
          rp.representative_key as public_key,
          rp.representative_name as node_name
        FROM repeater_prefixes rp
        WHERE rp.representative_key IN (SELECT node_id FROM visible_nodes)
      ),
      path_connections AS (
        -- Convert prefix-based path neighbors to public key connections
        -- Include all path connections (no exclusion of direct connections)
        SELECT 
          source_map.public_key as source_node,
          target_map.public_key as target_node,
          'path' as connection_type,
          pn.packet_count
        FROM path_neighbors pn
        JOIN prefix_to_key_map source_map ON pn.source_prefix = source_map.prefix
        JOIN prefix_to_key_map target_map ON pn.target_prefix = target_map.prefix
      ),
      direct_connections_filtered AS (
        -- Get direct connections but exclude pairs that already have path connections
        SELECT 
          source_node,
          target_node,
          connection_type,
          packet_count
        FROM direct_connections
        WHERE (source_node, target_node) NOT IN (
          SELECT source_node, target_node FROM path_connections
        )
        AND (target_node, source_node) NOT IN (
          SELECT source_node, target_node FROM path_connections
        )
      ),
      neighbor_connections AS (
        -- Combine path connections and filtered direct connections (path connections take precedence)
        SELECT source_node, target_node, connection_type, packet_count FROM path_connections
        UNION ALL
        SELECT source_node, target_node, connection_type, packet_count FROM direct_connections_filtered
      )
      SELECT 
        connections.source_node,
        connections.target_node,
        connections.connection_type,
        connections.packet_count,
        source_details.node_name as source_name,
        source_details.latitude as source_latitude,
        source_details.longitude as source_longitude,
        source_details.has_location as source_has_location,
        target_details.node_name as target_name,
        target_details.latitude as target_latitude,
        target_details.longitude as target_longitude,
        target_details.has_location as target_has_location
      FROM neighbor_connections AS connections
      LEFT JOIN visible_node_details AS source_details ON connections.source_node = source_details.public_key
      LEFT JOIN visible_node_details AS target_details ON connections.target_node = target_details.public_key
      WHERE source_details.public_key IS NOT NULL 
        AND target_details.public_key IS NOT NULL
        AND source_details.has_location = 1 
        AND target_details.has_location = 1
        AND source_details.latitude IS NOT NULL 
        AND source_details.longitude IS NOT NULL
        AND target_details.latitude IS NOT NULL 
        AND target_details.longitude IS NOT NULL
      ORDER BY connections.connection_type, connections.source_node, connections.target_node
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
    // Build base where conditions for both directions
    let baseWhereConditions = [];
    const params: Record<string, any> = { publicKey };
    
    // Add lastSeen filter if provided
    if (lastSeen !== null) {
      baseWhereConditions.push("ingest_timestamp >= now() - INTERVAL {lastSeen:UInt32} SECOND");
      params.lastSeen = Number(lastSeen);
    }
    
    const baseWhere = baseWhereConditions.length > 0 ? `AND ${baseWhereConditions.join(" AND ")}` : '';
    
    const neighborsQuery = `
      WITH neighbor_details AS (
        -- Get latest attributes for all nodes based on ingest_timestamp
        SELECT 
          public_key,
          argMax(node_name, ingest_timestamp) as node_name,
          argMax(latitude, ingest_timestamp) as latitude,
          argMax(longitude, ingest_timestamp) as longitude,
          argMax(has_location, ingest_timestamp) as has_location,
          argMax(is_repeater, ingest_timestamp) as is_repeater,
          argMax(is_chat_node, ingest_timestamp) as is_chat_node,
          argMax(is_room_server, ingest_timestamp) as is_room_server,
          argMax(has_name, ingest_timestamp) as has_name
        FROM meshcore_adverts 
        GROUP BY public_key
      ),
      neighbor_directions AS (
        -- Direction 1: Adverts heard directly by the queried node
        -- (hex(origin_pubkey) is the queried node, public_key is the neighbor)
        SELECT DISTINCT
          public_key as neighbor_public_key,
          'incoming' as direction
        FROM meshcore_adverts 
        WHERE hex(origin_pubkey) = {publicKey:String}
          AND path_len = 0
          AND public_key != {publicKey:String}
          ${baseWhere}
        
        UNION ALL
        
        -- Direction 2: Adverts from the queried node heard by other nodes
        -- (public_key is the queried node, origin_pubkey is the neighbor)
        SELECT DISTINCT
          hex(origin_pubkey) as neighbor_public_key,
          'outgoing' as direction
        FROM meshcore_adverts 
        WHERE public_key = {publicKey:String}
          AND path_len = 0
          AND hex(origin_pubkey) != {publicKey:String}
          ${baseWhere}
      )
      SELECT 
        neighbors.neighbor_public_key as public_key,
        details.node_name,
        details.latitude,
        details.longitude,
        details.has_location,
        details.is_repeater,
        details.is_chat_node,
        details.is_room_server,
        details.has_name,
        groupUniqArray(neighbors.direction) as directions
      FROM neighbor_directions AS neighbors
      LEFT JOIN neighbor_details AS details ON neighbors.neighbor_public_key = details.public_key
      WHERE details.public_key IS NOT NULL
      GROUP BY neighbors.neighbor_public_key, details.node_name, details.latitude, details.longitude, 
               details.has_location, details.is_repeater, details.is_chat_node, 
               details.is_room_server, details.has_name
      ORDER BY neighbors.neighbor_public_key
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
    
    // Build individual query parts
    const queryParts: string[] = [];
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
      
      const where: string[] = [];
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
      
      const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
      
      const queryPart = `
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
          ${index} as query_index
        FROM (
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
            min(ingest_timestamp) as first_heard,
            max(ingest_timestamp) as last_seen,
            argMax(broker, ingest_timestamp) as broker,
            argMax(topic, ingest_timestamp) as topic
          FROM meshcore_adverts 
          GROUP BY public_key
        ) 
        ${whereClause} 
        ORDER BY last_seen DESC 
        LIMIT {limit_${index}:UInt32}
      `;
      
      queryParts.push(queryPart);
      queryParams[`limit_${index}`] = limit;
      
      // Add query params to the global params object
      Object.assign(allParams, queryParams);
    });
    
    // Combine all queries with UNION ALL
    const finalQuery = queryParts.join(' UNION ALL ');
    
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
    
    // If single query, return results without query_index
    if (!Array.isArray(searchParams)) {
      return (rows as SearchResult[]).map(row => {
        const { query_index, ...result } = row;
        return result;
      });
    }
    
    // For batch queries, group results by query_index
    const groupedResults = (rows as SearchResult[]).reduce((acc, row) => {
      const index = row.query_index || 0;
      if (!acc[index]) {
        acc[index] = [];
      }
      const { query_index, ...result } = row;
      acc[index].push(result);
      return acc;
    }, {} as Record<number, SearchResult[]>);
    
    // Return results in the same order as input queries
    return queries.map((_, index) => groupedResults[index] || []);
  } catch (error) {
    console.error('ClickHouse error in searchMeshcoreNodes:', error);
    throw error;
  }
} 