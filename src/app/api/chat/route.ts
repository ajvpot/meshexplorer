import { NextResponse } from "next/server";
import { getLatestChatMessages } from "@/lib/clickhouse/actions";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const before = searchParams.get("before") || undefined;
    const messages = await getLatestChatMessages({ limit, before });
    return NextResponse.json(messages);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch chat messages" }, { status: 500 });
  }
} 