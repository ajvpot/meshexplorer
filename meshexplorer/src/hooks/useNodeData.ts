import { useQuery } from '@tanstack/react-query';
import { Code, ConnectError } from '@connectrpc/connect';
import { nodeClient } from '@/lib/connect/client';
import type { GetNodeResponse } from '@/gen/meshexplorer/v1/node_pb';

export interface NodeInfo {
  public_key: string;
  node_name: string;
  latitude: number | null;
  longitude: number | null;
  has_location: number;
  is_repeater: number;
  is_chat_node: number;
  is_room_server: number;
  has_name: number;
  broker: string | null;
  topic: string | null;
  first_seen: string;
  last_seen: string;
}

export interface Advert {
  group_id: number;
  origin_path_pubkey_tuples: Array<[string, string, string]>; // Array of [origin, path, origin_pubkey] tuples
  advert_count: number;
  earliest_timestamp: string;
  latest_timestamp: string;
  latitude: number | null;
  longitude: number | null;
  is_repeater: number;
  is_chat_node: number;
  is_room_server: number;
  has_location: number;
  packet_hash: string;
}

export interface LocationHistory {
  mesh_timestamp: string;
  latitude: number;
  longitude: number;
}

export interface MqttTopic {
  topic: string;
  broker: string;
  last_packet_time: string;
  is_recent: boolean;
}

export interface MqttInfo {
  is_uplinked: boolean;
  has_packets: boolean;
  topics: MqttTopic[];
}

export interface NodeData {
  node: NodeInfo;
  recentAdverts: Advert[];
  locationHistory: LocationHistory[];
  mqtt: MqttInfo;
  region: string | null;
}

export interface NodeError {
  error: string;
  code: string;
  publicKey?: string;
}

interface UseNodeDataParams {
  publicKey: string | null;
  limit?: number;
  enabled?: boolean;
}

// Maps the generated (camelCase) GetNodeResponse to the snake_case NodeData
// shape the page components already consume.
function toNodeData(res: GetNodeResponse): NodeData {
  const node = res.node!;
  return {
    node: {
      public_key: node.publicKey,
      node_name: node.nodeName,
      latitude: node.latitude ?? null,
      longitude: node.longitude ?? null,
      has_location: node.hasLocation,
      is_repeater: node.isRepeater,
      is_chat_node: node.isChatNode,
      is_room_server: node.isRoomServer,
      has_name: node.hasName,
      broker: node.broker ?? null,
      topic: node.topic ?? null,
      first_seen: node.firstSeen,
      last_seen: node.lastSeen,
    },
    recentAdverts: res.recentAdverts.map((a, index) => ({
      group_id: index,
      origin_path_pubkey_tuples: a.originPathPubkeyTuples.map(
        (t) => [t.origin, t.path, t.originPubkey] as [string, string, string],
      ),
      advert_count: a.advertCount,
      earliest_timestamp: a.earliestTimestamp,
      latest_timestamp: a.latestTimestamp,
      latitude: a.latitude ?? null,
      longitude: a.longitude ?? null,
      is_repeater: a.isRepeater,
      is_chat_node: a.isChatNode,
      is_room_server: a.isRoomServer,
      has_location: a.hasLocation,
      packet_hash: a.packetHash,
    })),
    locationHistory: res.locationHistory.map((l) => ({
      mesh_timestamp: l.meshTimestamp,
      latitude: l.latitude,
      longitude: l.longitude,
    })),
    mqtt: {
      is_uplinked: res.mqtt?.isUplinked ?? false,
      has_packets: res.mqtt?.hasPackets ?? false,
      topics: (res.mqtt?.topics ?? []).map((t) => ({
        topic: t.topic,
        broker: t.broker,
        last_packet_time: t.lastPacketTime,
        is_recent: t.isRecent,
      })),
    },
    region: res.region ?? null,
  };
}

// Maps a ConnectError to the NodeError shape (with HTTP-like status) the
// node page uses to pick an error icon/title and drive retry behavior.
function toNodeError(err: unknown): NodeError & { status: number } {
  if (err instanceof ConnectError) {
    switch (err.code) {
      case Code.NotFound:
        return { error: err.message, code: 'NODE_NOT_FOUND', status: 404 };
      case Code.InvalidArgument:
        return { error: err.message, code: 'INVALID_PUBLIC_KEY', status: 400 };
      case Code.Unavailable:
        return { error: err.message, code: 'DATABASE_ERROR', status: 503 };
      default:
        return { error: err.message, code: 'INTERNAL_ERROR', status: 500 };
    }
  }
  return { error: 'An unexpected error occurred', code: 'UNKNOWN_ERROR', status: 500 };
}

export function useNodeData({ publicKey, limit = 50, enabled = true }: UseNodeDataParams) {
  return useQuery<NodeData, NodeError & { status: number }>({
    queryKey: ['node-data', publicKey, limit],
    queryFn: async (): Promise<NodeData> => {
      if (!publicKey) {
        throw { error: 'Public key is required', code: 'MISSING_PUBLIC_KEY', status: 400 } as NodeError & {
          status: number;
        };
      }

      try {
        const res = await nodeClient.getNode({ publicKey, limit });
        return toNodeData(res);
      } catch (err) {
        throw toNodeError(err);
      }
    },
    enabled: enabled && !!publicKey,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: (failureCount, error) => {
      // Don't retry for client errors (4xx)
      const status = error?.status;
      if (status && status >= 400 && status < 500) {
        return false;
      }
      // Retry up to 1 time for server errors
      return failureCount < 1;
    },
  });
}
