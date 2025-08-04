import { NextResponse } from "next/server";
import { clickhouse } from "@/lib/clickhouse/clickhouse";

export async function GET() {
  try {
    const query = `
      SELECT 
          substring(public_key, 1, 2) as prefix,
          count() as node_count,
          groupArray(node_name) as node_names
      FROM meshcore_adverts_latest 
      WHERE is_repeater = 1 
          AND last_seen >= now() - INTERVAL 7 DAY
      GROUP BY prefix
      ORDER BY node_count DESC, prefix ASC
    `;
    const resultSet = await clickhouse.query({ query, format: 'JSONEachRow' });
    const rows = await resultSet.json() as Array<{ prefix: string; node_count: number; node_names: string[] }>;
    return NextResponse.json({ data: rows });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch repeater prefixes" }, { status: 500 });
  }
} 