import { NextResponse } from "next/server";
import { getMeshcoreNodeInfo } from "@/lib/clickhouse/actions";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ publicKey: string }> }
) {
  try {
    const { publicKey } = await params;
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    
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

    const nodeInfo = await getMeshcoreNodeInfo(publicKey, limit);
    
    if (!nodeInfo) {
      return NextResponse.json({ 
        error: "Node not found",
        code: "NODE_NOT_FOUND",
        publicKey: publicKey
      }, { status: 404 });
    }

    return NextResponse.json(nodeInfo);
  } catch (error) {
    console.error("Error fetching meshcore node info:", error);
    
    // Check if it's a ClickHouse connection error
    if (error instanceof Error && error.message.includes('ClickHouse')) {
      return NextResponse.json({ 
        error: "Database temporarily unavailable",
        code: "DATABASE_ERROR"
      }, { status: 503 });
    }
    
    return NextResponse.json({ 
      error: "Failed to fetch node info",
      code: "INTERNAL_ERROR"
    }, { status: 500 });
  }
}
