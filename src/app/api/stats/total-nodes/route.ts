import { NextResponse } from "next/server";
import { clickhouse } from "@/lib/clickhouse/clickhouse";

export async function GET() {
  try {
    const query = `SELECT count() AS total_nodes FROM meshcore_adverts_latest`;
    const resultSet = await clickhouse.query({ query, format: 'JSONEachRow' });
    const rows = await resultSet.json() as Array<{ total_nodes: number }>;
    const total = rows.length > 0 ? Number(rows[0].total_nodes) : 0;
    return NextResponse.json({ total_nodes: total });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch total nodes" }, { status: 500 });
  }
} 