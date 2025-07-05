import { NextResponse } from "next/server";
import { clickhouse } from "@/lib/clickhouse/clickhouse";

export async function GET() {
  try {
    const query = `
      SELECT channel_hash, count() AS message_count
      FROM meshcore_public_channel_messages
      GROUP BY channel_hash
      ORDER BY message_count DESC
      LIMIT 10
    `;
    const resultSet = await clickhouse.query({ query, format: 'JSONEachRow' });
    const rows = await resultSet.json() as Array<{ channel_hash: string, message_count: number }>;
    return NextResponse.json({ data: rows });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch popular channels" }, { status: 500 });
  }
} 