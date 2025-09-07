"use server";
import { clickhouse } from "./clickhouse";
import { generateRegionWhereClauseFromArray } from "../regionFilters";

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
    // Get basic node info from the latest advert
    const nodeInfoQuery = `
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
        mesh_timestamp as last_seen
      FROM meshcore_adverts 
      WHERE public_key = {publicKey:String}
      ORDER BY mesh_timestamp DESC 
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
    
    // Get recent adverts with path information
    const advertsQuery = `
      SELECT 
        mesh_timestamp,
        hex(path) as path,
        path_len,
        latitude,
        longitude,
        is_repeater,
        is_chat_node,
        is_room_server,
        has_location,
        hex(origin_pubkey) as origin_pubkey,
        concat(hex(path), substring(hex(origin_pubkey), 1, 4)) as full_path
      FROM meshcore_adverts 
      WHERE public_key = {publicKey:String}
      ORDER BY mesh_timestamp DESC 
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
        longitude,
        hex(path) as path,
        path_len,
        hex(origin_pubkey) as origin_pubkey,
        concat(hex(path), substring(hex(origin_pubkey), 1, 4)) as full_path
      FROM (
        SELECT 
          mesh_timestamp,
          latitude,
          longitude,
          path,
          path_len,
          origin_pubkey,
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
    
    // Check MQTT uplink status and last packet time
    const mqttQuery = `
      SELECT 
        count() > 0 as has_packets,
        max(ingest_timestamp) as last_uplink_time,
        max(ingest_timestamp) >= now() - INTERVAL 7 DAY as is_uplinked
      FROM meshcore_packets 
      WHERE hex(origin_pubkey) = {publicKey:String}
    `;
    
    const mqttResult = await clickhouse.query({ 
      query: mqttQuery, 
      query_params: { publicKey }, 
      format: 'JSONEachRow' 
    });
    const mqttData = await mqttResult.json();
    
    return {
      node: nodeInfo[0],
      recentAdverts: adverts,
      locationHistory: locationHistory,
      mqtt: mqttData[0] || { is_uplinked: false, last_uplink_time: null }
    };
  } catch (error) {
    console.error('ClickHouse error in getMeshcoreNodeInfo:', error);
    throw error;
  }
} 