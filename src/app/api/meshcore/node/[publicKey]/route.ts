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
      return NextResponse.json({ error: "Public key is required" }, { status: 400 });
    }

    const nodeInfo = await getMeshcoreNodeInfo(publicKey, limit);
    
    if (!nodeInfo) {
      return NextResponse.json({ error: "Node not found" }, { status: 404 });
    }

    return NextResponse.json(nodeInfo);
  } catch (error) {
    console.error("Error fetching meshcore node info:", error);
    return NextResponse.json({ error: "Failed to fetch node info" }, { status: 500 });
  }
}
