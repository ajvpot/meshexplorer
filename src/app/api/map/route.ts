import { NextResponse } from "next/server";
import { getNodePositions } from "@/lib/clickhouse/actions";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const minLat = searchParams.get("minLat");
    const maxLat = searchParams.get("maxLat");
    const minLng = searchParams.get("minLng");
    const maxLng = searchParams.get("maxLng");
    const nodeTypes = searchParams.getAll("nodeTypes");
    const lastSeen = searchParams.get("lastSeen");
    const positions = await getNodePositions({ minLat, maxLat, minLng, maxLng, nodeTypes, lastSeen });
    return NextResponse.json(positions);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch node positions" }, { status: 500 });
  }
} 