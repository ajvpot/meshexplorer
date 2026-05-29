import { createClient } from "@connectrpc/connect";
import { transport } from "./transport";
import { MapService } from "@/gen/meshexplorer/v1/map_pb";
import { NodeService } from "@/gen/meshexplorer/v1/node_pb";
import { ChatService } from "@/gen/meshexplorer/v1/chat_pb";

// Promise-based clients for the imperative call sites that don't fit the
// connect-query hook shape (the map's manual fetch, batched search, and the
// infinite-scroll chat query). The simple hooks use connect-query directly.
export const mapClient = createClient(MapService, transport);
export const nodeClient = createClient(NodeService, transport);
export const chatClient = createClient(ChatService, transport);
