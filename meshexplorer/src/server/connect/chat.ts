import type { MessageInitShape } from "@bufbuild/protobuf";
import type { ServiceImpl } from "@connectrpc/connect";
import { ChatService } from "@/gen/meshexplorer/v1/chat_pb";
import type { ChatMessageSchema } from "@/gen/meshexplorer/v1/chat_pb";
import { getLatestChatMessages } from "@/lib/clickhouse/actions";
import {
  createClickHouseStreamer,
  createChatMessagesStreamerConfig,
} from "@/lib/clickhouse/streaming";
import { decryptMeshcoreGroupMessage } from "@/lib/meshcore";
import { num } from "./mappers";

const PUBLIC_MESHCORE_KEY = "izOH6cXN6mrJ5e26oRXNcg==";

interface ChatRow {
  ingest_timestamp: string;
  mesh_timestamp: string;
  channel_hash: string;
  mac: string;
  encrypted_message: string;
  message_count: number;
  origin_path_info: Array<[string, string, string, string, string]>;
  message_id: string;
}

type ParsedMessage = {
  timestamp: number;
  msgType: number;
  sender: string;
  text: string;
  rawText: string;
};

function toChatMessage(
  row: ChatRow,
  decrypted: ParsedMessage | null,
): MessageInitShape<typeof ChatMessageSchema> {
  return {
    ingestTimestamp: row.ingest_timestamp,
    meshTimestamp: row.mesh_timestamp,
    channelHash: row.channel_hash,
    mac: row.mac,
    encryptedMessage: row.encrypted_message,
    messageCount: num(row.message_count),
    originPathInfo: (row.origin_path_info ?? []).map(
      ([origin, originPubkey, path, broker, topic]) => ({
        origin,
        originPubkey,
        path,
        broker,
        topic,
      }),
    ),
    messageId: row.message_id,
    decrypted: decrypted
      ? {
          timestamp: decrypted.timestamp,
          msgType: decrypted.msgType,
          sender: decrypted.sender,
          text: decrypted.text,
          rawText: decrypted.rawText,
        }
      : undefined,
  };
}

async function decryptRow(row: ChatRow, keys: string[]): Promise<ParsedMessage | null> {
  try {
    const decrypted = (await decryptMeshcoreGroupMessage({
      encrypted_message: row.encrypted_message,
      mac: row.mac,
      channel_hash: row.channel_hash,
      knownKeys: keys,
      parse: true,
    })) as ParsedMessage | null;
    return decrypted ?? null;
  } catch {
    return null;
  }
}

export const chatServiceImpl: ServiceImpl<typeof ChatService> = {
  async getChat(req) {
    const messages = (await getLatestChatMessages({
      limit: req.limit ?? 20,
      before: req.before,
      after: req.after,
      channelId: req.channelId,
      region: req.region,
    })) as ChatRow[];

    const keys = req.decrypt ? [PUBLIC_MESHCORE_KEY, ...req.privateKeys] : [];

    const out: MessageInitShape<typeof ChatMessageSchema>[] = [];
    for (const row of messages) {
      if (req.decrypt) {
        const decrypted = await decryptRow(row, keys);
        // Match the REST endpoint: only emit messages that decrypted.
        if (decrypted) {
          out.push(toChatMessage(row, decrypted));
        }
      } else {
        out.push(toChatMessage(row, null));
      }
    }
    return { messages: out };
  },

  async *streamChat(req) {
    const channelId = req.channelId ? req.channelId.toLowerCase() : undefined;
    const config = createChatMessagesStreamerConfig(channelId, req.region);
    config.pollInterval = req.pollInterval ?? 1000;
    config.maxRowsPerPoll = req.maxRows ?? 500;
    config.skipInitialMessages = req.skipInitialMessages;

    const streamer = createClickHouseStreamer<ChatRow>(config);
    const keys = req.decrypt ? [PUBLIC_MESHCORE_KEY, ...req.privateKeys] : [];

    const params: Record<string, unknown> = {};
    if (channelId) params.channelId = channelId;

    for await (const result of streamer(params)) {
      const row = result.row;
      const decrypted = req.decrypt ? await decryptRow(row, keys) : null;
      yield toChatMessage(row, decrypted);
    }
  },
};
