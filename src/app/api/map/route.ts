import { NextResponse } from "next/server";
import { getNodePositions, getAllNodeNeighbors } from "@/lib/clickhouse/actions";

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
    const includeNeighbors = searchParams.get("includeNeighbors") === "true";
    
    const positions = await getNodePositions({ minLat, maxLat, minLng, maxLng, nodeTypes, lastSeen });
    
    if (includeNeighbors) {
      const neighbors = await getAllNodeNeighbors(lastSeen, minLat, maxLat, minLng, maxLng, nodeTypes, region || undefined);
      return NextResponse.json({
        nodes: positions,
        neighbors: neighbors
      });
    }
    
    // Return just the positions array for backward compatibility
    return NextResponse.json(positions);
  } catch (error) {
    console.error("Error fetching map data:", error);
    
    // Check if it's a ClickHouse connection error
    if (error instanceof Error && error.message.includes('ClickHouse')) {
      return NextResponse.json({ 
        error: "Database temporarily unavailable",
        code: "DATABASE_ERROR"
      }, { status: 503 });
    }
    
    return NextResponse.json({ 
      error: "Failed to fetch map data",
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
} 