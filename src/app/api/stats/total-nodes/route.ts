import { NextResponse } from "next/server";
import { clickhouse } from "@/lib/clickhouse/clickhouse";
import { generateRegionWhereClause } from "@/lib/regionFilters";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const region = searchParams.get("region") || undefined;
    
    const regionFilter = generateRegionWhereClause(region);
    const whereClause = regionFilter.whereClause ? `WHERE ${regionFilter.whereClause}` : '';
    
    const query = `SELECT count(DISTINCT public_key) AS total_nodes FROM meshcore_adverts ${whereClause}`;
    
    const resultSet = await clickhouse.query({ query, format: 'JSONEachRow' });
    const rows = await resultSet.json() as Array<{ total_nodes: number }>;
    const total = rows.length > 0 ? Number(rows[0].total_nodes) : 0;
    return NextResponse.json({ total_nodes: total });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch total nodes" }, { status: 500 });
  }
} 