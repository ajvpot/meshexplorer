import { NextResponse } from "next/server";
import { clickhouse } from "@/lib/clickhouse/clickhouse";
import { generateRegionWhereClause } from "@/lib/regionFilters";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region") || undefined;
    
    const regionFilter = generateRegionWhereClause(region);
    const regionWhereClause = regionFilter.whereClause ? `WHERE ${regionFilter.whereClause}` : '';
    
    const query = `
      WITH all_nodes AS (
        SELECT toDate(ingest_timestamp) AS day, public_key, latitude, longitude, is_repeater, is_room_server
        FROM meshcore_adverts
        ${regionWhereClause}
      ),
      all_days AS (
        SELECT DISTINCT day FROM all_nodes
        ORDER BY day ASC
      ),
      rolling_window AS (
        SELECT 
          d.day,
          n.public_key,
          n.latitude,
          n.longitude,
          n.is_repeater,
          n.is_room_server
        FROM all_days d
        INNER JOIN all_nodes n ON n.day BETWEEN (d.day - INTERVAL 6 DAY) AND d.day
      )
      SELECT day,
        count(DISTINCT public_key) AS cumulative_unique_nodes,
        count(DISTINCT CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL AND latitude != 0 AND longitude != 0 THEN public_key END) AS nodes_with_location,
        count(DISTINCT CASE WHEN latitude IS NULL OR longitude IS NULL OR latitude = 0 OR longitude = 0 THEN public_key END) AS nodes_without_location,
        count(DISTINCT CASE WHEN is_repeater = 1 THEN public_key END) AS repeaters,
        count(DISTINCT CASE WHEN is_room_server = 1 THEN public_key END) AS room_servers
      FROM rolling_window
      GROUP BY day
      ORDER BY day ASC
    `;
    const resultSet = await clickhouse.query({ query, format: 'JSONEachRow' });
    const rows = await resultSet.json() as Array<{
      day: string,
      cumulative_unique_nodes: number,
      nodes_with_location: number,
      nodes_without_location: number,
      repeaters: number,
      room_servers: number
    }>;
    return NextResponse.json({ data: rows });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch nodes over time" }, { status: 500 });
  }
} 