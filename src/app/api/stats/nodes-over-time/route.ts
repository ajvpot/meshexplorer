import { NextResponse } from "next/server";
import { clickhouse } from "@/lib/clickhouse/clickhouse";

export async function GET() {
  try {
    const query = `
      WITH days AS (
        SELECT arrayJoin(range(0, 7)) AS offset, toDate(subtractDays(today(), 6 - offset)) AS day
      ),
      all_nodes AS (
        SELECT toDate(ingest_timestamp) AS day, public_key, latitude, longitude
        FROM meshcore_adverts
        WHERE ingest_timestamp >= subtractDays(today(), 7)
      ),
      node_days AS (
        SELECT public_key, min(day) AS first_seen, any(latitude) AS latitude, any(longitude) AS longitude
        FROM all_nodes
        GROUP BY public_key
      ),
      expanded AS (
        SELECT d.day, nd.public_key, nd.latitude, nd.longitude
        FROM days d
        INNER JOIN node_days nd ON nd.first_seen <= d.day
      )
      SELECT day,
        count(DISTINCT public_key) AS cumulative_unique_nodes,
        count(DISTINCT CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL THEN public_key END) AS nodes_with_location,
        count(DISTINCT CASE WHEN latitude IS NULL OR longitude IS NULL THEN public_key END) AS nodes_without_location
      FROM expanded
      GROUP BY day
      ORDER BY day ASC
    `;
    const resultSet = await clickhouse.query({ query, format: 'JSONEachRow' });
    const rows = await resultSet.json() as Array<{
      day: string,
      cumulative_unique_nodes: number,
      nodes_with_location: number,
      nodes_without_location: number
    }>;
    return NextResponse.json({ data: rows });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch nodes over time" }, { status: 500 });
  }
} 