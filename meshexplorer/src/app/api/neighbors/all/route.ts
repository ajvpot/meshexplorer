import { NextResponse } from "next/server";
import { getAllNodeNeighbors } from "@/lib/clickhouse/actions";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const minLat = searchParams.get("minLat");
    const maxLat = searchParams.get("maxLat");
    const minLng = searchParams.get("minLng");
    const maxLng = searchParams.get("maxLng");
    const nodeTypes = searchParams.getAll("nodeTypes");
    const lastSeen = searchParams.get("lastSeen");
    const region = searchParams.get("region");

    const neighbors = await getAllNodeNeighbors(lastSeen, minLat, maxLat, minLng, maxLng, nodeTypes, region || undefined);
    
    return NextResponse.json(neighbors);
  } catch (error) {
    console.error("Error fetching all node neighbors:", error);
    
    // Check if it's a ClickHouse connection error
    if (error instanceof Error && error.message.includes('ClickHouse')) {
      return NextResponse.json({ 
        error: "Database temporarily unavailable",
        code: "DATABASE_ERROR"
      }, { status: 503 });
    }
    
    return NextResponse.json({ 
      error: "Failed to fetch all neighbors",
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
}

