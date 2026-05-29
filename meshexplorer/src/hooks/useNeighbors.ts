import { useQuery } from '@connectrpc/connect-query';
import { NodeService } from '@/gen/meshexplorer/v1/node_pb';

export interface Neighbor {
  public_key: string;
  node_name: string;
  latitude: number | null;
  longitude: number | null;
  has_location: number;
  is_repeater: number;
  is_chat_node: number;
  is_room_server: number;
  has_name: number;
  directions: string[];
}

interface UseNeighborsParams {
  nodeId: string | null;
  lastSeen?: number | null;
  enabled?: boolean;
}

export function useNeighbors({ nodeId, lastSeen, enabled = true }: UseNeighborsParams) {
  return useQuery(
    NodeService.method.getNodeNeighbors,
    {
      publicKey: nodeId ?? '',
      lastSeen: lastSeen ?? undefined,
    },
    {
      select: (res): Neighbor[] =>
        res.neighbors.map((n) => ({
          public_key: n.publicKey,
          node_name: n.nodeName,
          latitude: n.latitude ?? null,
          longitude: n.longitude ?? null,
          has_location: n.hasLocation,
          is_repeater: n.isRepeater,
          is_chat_node: n.isChatNode,
          is_room_server: n.isRoomServer,
          has_name: n.hasName,
          directions: n.directions,
        })),
      enabled: enabled && !!nodeId,
      staleTime: 15 * 60 * 1000, // 15 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
    },
  );
}
