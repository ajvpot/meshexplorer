"use server";
import { clickhouse } from "./clickhouse";

export async function getNodePositions({ minLat, maxLat, minLng, maxLng, nodeTypes, lastSeen }: { minLat?: string | null, maxLat?: string | null, minLng?: string | null, maxLng?: string | null, nodeTypes?: string[], lastSeen?: string | null } = {}) {
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
    const query = `SELECT node_id, name, short_name, latitude, longitude, last_seen, type FROM unified_latest_nodeinfo WHERE ${where.join(" AND ")}`;
    const resultSet = await clickhouse.query({ query, query_params: params, format: 'JSONEachRow' });
    const rows = await resultSet.json();
    return rows as Array<{
      node_id: string;
      name?: string | null;
      short_name?: string | null;
      latitude: number;
      longitude: number;
      last_seen: string;
      type: string;
    }>;
} 