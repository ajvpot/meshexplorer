import { NextResponse } from "next/server";
import { getLatestChatMessages } from "@/lib/clickhouse/actions";
import { getChannelIdFromKey } from "@/lib/meshcore";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const before = searchParams.get("before") || undefined;
    const after = searchParams.get("after") || undefined;
    const channelId = searchParams.get("channel_id") || undefined;
    const region = searchParams.get("region") || undefined;
    const messages = await getLatestChatMessages({ limit, before, after, channelId, region } as { limit?: number, before?: string, after?: string, channelId?: string, region?: string });
    return NextResponse.json(messages);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch chat messages" }, { status: 500 });
  }
} 