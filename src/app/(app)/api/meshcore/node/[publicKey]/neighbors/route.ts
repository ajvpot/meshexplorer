import { NextResponse } from "next/server";
import { getMeshcoreNodeNeighbors } from "@/lib/clickhouse/actions";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ publicKey: string }> }
) {
  try {
    const { publicKey } = await params;
    const { searchParams } = new URL(req.url);
    const lastSeen = searchParams.get("lastSeen");
    
    if (!publicKey) {
      return NextResponse.json({ 
        error: "Public key is required",
        code: "MISSING_PUBLIC_KEY"
      }, { status: 400 });
    }

    // Validate public key format (basic validation)
    if (publicKey.length < 10) {
      return NextResponse.json({ 
        error: "Invalid public key format",
        code: "INVALID_PUBLIC_KEY"
      }, { status: 400 });
    }

    const neighbors = await getMeshcoreNodeNeighbors(publicKey, lastSeen);
    
    // Check if the parent node exists by trying to get basic node info
    // This is a lightweight check to ensure the node exists before returning neighbors
    if (!neighbors || neighbors.length === 0) {
      // We could add a check here to verify the parent node exists
      // For now, we'll return an empty array which is valid for nodes with no neighbors
      return NextResponse.json([]);
    }
    
    return NextResponse.json(neighbors);
  } catch (error) {
    console.error("Error fetching meshcore node neighbors:", error);
    
    // Check if it's a ClickHouse connection error
    if (error instanceof Error && error.message.includes('ClickHouse')) {
      return NextResponse.json({ 
        error: "Database temporarily unavailable",
        code: "DATABASE_ERROR"
      }, { status: 503 });
    }
    
    return NextResponse.json({ 
      error: "Failed to fetch neighbors",
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
}