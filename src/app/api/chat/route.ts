import { NextResponse } from "next/server";
import { getLatestChatMessages } from "@/lib/clickhouse/actions";
import { getChannelIdFromKey, decryptMeshcoreGroupMessage } from "@/lib/meshcore";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const before = searchParams.get("before") || undefined;
    const after = searchParams.get("after") || undefined;
    const channelId = searchParams.get("channel_id") || undefined;
    const region = searchParams.get("region") || undefined;
    const decrypt = searchParams.has("decrypt");
    const privateKeys = searchParams.getAll("privateKeys");
    
    // Always include the public meshcore key
    const PUBLIC_MESHCORE_KEY = "izOH6cXN6mrJ5e26oRXNcg==";
    const allKeys = [PUBLIC_MESHCORE_KEY, ...privateKeys];
    
    const messages = await getLatestChatMessages({ limit, before, after, channelId, region } as { limit?: number, before?: string, after?: string, channelId?: string, region?: string });
    
    if (decrypt) {
      const decryptedMessages = [];
      
      for (const message of messages) {
        try {
          const decrypted = await decryptMeshcoreGroupMessage({
            encrypted_message: message.encrypted_message,
            mac: message.mac,
            channel_hash: message.channel_hash,
            knownKeys: allKeys,
            parse: true
          });
          
          if (decrypted) {
            decryptedMessages.push({
              ...message,
              decrypted
            });
          } 
        } catch (error) {
          // Skip messages that fail to decrypt
          console.warn("Failed to decrypt message:", error);
        }
      }
      
      return NextResponse.json(decryptedMessages);
    }
    
    return NextResponse.json(messages);
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch chat messages" }, { status: 500 });
  }
} 