"use server";
import { clickhouse } from "./clickhouse";
import { generateRegionWhereClauseFromArray, generateRegionWhereClause } from "../regionFilters";

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
    const query = `SELECT ingest_timestamp, mesh_timestamp, channel_hash, mac, hex(encrypted_message) AS encrypted_message, message_count, origin_key_path_array FROM meshcore_public_channel_messages ${whereClause} ORDER BY ingest_timestamp DESC LIMIT {limit:UInt32}`;
    const resultSet = await clickhouse.query({ query, query_params: params, format: 'JSONEachRow' });
    const rows = await resultSet.json();
    return rows as Array<{
      ingest_timestamp: string;
      mesh_timestamp: string;
      channel_hash: string;
      mac: string;
      encrypted_message: string;
      message_count: number;
      origin_key_path_array: Array<[string, string, string]>; // Array of [origin, pubkey, path] tuples
    }>;
  } catch (error) {
    console.error('ClickHouse error in getLatestChatMessages:', error);
    throw error;
  }
}

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
    const nodeInfo = await nodeInfoResult.json();
    
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
    
    return {
      node: nodeInfo[0],
      recentAdverts: adverts,
      locationHistory: locationHistory,
      mqtt: {
        is_uplinked: isUplinked,
        has_packets: hasPackets,
        topics: mqttTopics
      }
    };
  } catch (error) {
    console.error('ClickHouse error in getMeshcoreNodeInfo:', error);
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
      SELECT 
        public_key,
        argMax(node_name, timestamp_ref) as node_name,
        argMax(latitude, timestamp_ref) as latitude,
        argMax(longitude, timestamp_ref) as longitude,
        argMax(has_location, timestamp_ref) as has_location,
        argMax(is_repeater, timestamp_ref) as is_repeater,
        argMax(is_chat_node, timestamp_ref) as is_chat_node,
        argMax(is_room_server, timestamp_ref) as is_room_server,
        argMax(has_name, timestamp_ref) as has_name,
        groupUniqArray(direction) as directions
      FROM (
        -- Direction 1: Adverts heard directly by the queried node
        -- (hex(origin_pubkey) is the queried node, public_key is the neighbor)
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
          ingest_timestamp as timestamp_ref,
          'incoming' as direction
        FROM meshcore_adverts 
        WHERE hex(origin_pubkey) = {publicKey:String}
          AND path_len = 0
          AND public_key != {publicKey:String}
          ${baseWhere}
        
        UNION ALL
        
        -- Direction 2: Adverts from the queried node heard by other nodes
        -- (public_key is the queried node, origin_pubkey is the neighbor)
        -- Use a subquery to get neighbor node attributes
        SELECT 
          neighbor.public_key,
          neighbor.node_name,
          neighbor.latitude,
          neighbor.longitude,
          neighbor.has_location,
          neighbor.is_repeater,
          neighbor.is_chat_node,
          neighbor.is_room_server,
          neighbor.has_name,
          adv.ingest_timestamp as timestamp_ref,
          'outgoing' as direction
        FROM (
          SELECT DISTINCT 
            hex(origin_pubkey) as neighbor_key,
            ingest_timestamp
          FROM meshcore_adverts 
          WHERE public_key = {publicKey:String}
            AND path_len = 0
            AND hex(origin_pubkey) != {publicKey:String}
            ${baseWhere}
        ) adv
        LEFT JOIN (
          SELECT DISTINCT
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
        ) neighbor ON adv.neighbor_key = neighbor.public_key
      ) AS combined_neighbors
      GROUP BY public_key
      ORDER BY public_key
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

export async function searchMeshcoreNodes({ 
  query: searchQuery, 
  region, 
  lastSeen,
  limit = 50 
}: { 
  query?: string; 
  region?: string; 
  lastSeen?: string | null;
  limit?: number; 
} = {}) {
  try {
    let where = [];
    const params: Record<string, any> = { limit };
    
    // Add search conditions
    if (searchQuery && searchQuery.trim()) {
      const trimmedQuery = searchQuery.trim();
      
      // Check if it looks like a public key (hex string)
      if (/^[0-9A-Fa-f]+$/.test(trimmedQuery)) {
        // Search by public key prefix
        where.push('public_key LIKE {publicKeyPattern:String}');
        params.publicKeyPattern = `${trimmedQuery.toUpperCase()}%`;
      } else {
        // Search by node name (case insensitive, anywhere in the name)
        where.push('lower(node_name) LIKE {namePattern:String}');
        params.namePattern = `%${trimmedQuery.toLowerCase()}%`;
      }
    }
    
    // Add lastSeen filter if provided
    if (lastSeen !== null && lastSeen !== undefined && lastSeen !== "") {
      where.push('last_seen >= now() - INTERVAL {lastSeen:UInt32} SECOND');
      params.lastSeen = Number(lastSeen);
    }
    
    // Add region filtering if specified
    const regionFilter = generateRegionWhereClause(region);
    if (regionFilter.whereClause) {
      where.push(regionFilter.whereClause);
    }
    
    const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
    
    const query = `
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
        topic
      FROM meshcore_adverts_latest 
      ${whereClause} 
      ORDER BY last_seen DESC 
      LIMIT {limit:UInt32}
    `;
    
    const resultSet = await clickhouse.query({ 
      query, 
      query_params: params, 
      format: 'JSONEachRow' 
    });
    const rows = await resultSet.json();
    
    return rows as Array<{
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
    }>;
  } catch (error) {
    console.error('ClickHouse error in searchMeshcoreNodes:', error);
    throw error;
  }
} 