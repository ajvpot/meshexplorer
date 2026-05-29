import { useQuery } from '@connectrpc/connect-query';
import { NodeService } from '@/gen/meshexplorer/v1/node_pb';

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
      // Unwrap the response to the generated Neighbor[] (no field mapping).
      select: (res) => res.neighbors,
      enabled: enabled && !!nodeId,
      staleTime: 15 * 60 * 1000, // 15 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
    },
  );
}
