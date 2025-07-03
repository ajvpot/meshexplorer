"use server";
import { clickhouse } from "./clickhouse";

export async function getNodePositions({ minLat, maxLat, minLng, maxLng }: { minLat?: string | null, maxLat?: string | null, minLng?: string | null, maxLng?: string | null } = {}) {
    let where = [
      "latitude IS NOT NULL",
      "longitude IS NOT NULL"
    ];
    if (minLat) where.push(`latitude >= ${minLat}`);
    if (maxLat) where.push(`latitude <= ${maxLat}`);
    if (minLng) where.push(`longitude >= ${minLng}`);
    if (maxLng) where.push(`longitude <= ${maxLng}`);
    const query = `SELECT node_id, name, short_name, latitude, longitude, last_seen, type FROM unified_latest_nodeinfo WHERE ${where.join(" AND ")}`;
    const rows = await clickhouse.query(query).toPromise();
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