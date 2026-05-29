import { useQuery } from '@connectrpc/connect-query';
import { NeighborsService } from '@/gen/meshexplorer/v1/neighbors_pb';

export interface AllNeighborsConnection {
  source_node: string;
  target_node: string;
  connection_type: string;
  packet_count: number;
  source_name: string;
  source_latitude: number;
  source_longitude: number;
  source_has_location: number;
  target_name: string;
  target_latitude: number;
  target_longitude: number;
  target_has_location: number;
}

interface UseAllNeighborsParams {
  minLat?: number | null;
  maxLat?: number | null;
  minLng?: number | null;
  maxLng?: number | null;
  nodeTypes?: string[];
  lastSeen?: number | null;
  region?: string;
  enabled?: boolean;
}

export function useAllNeighbors({
  minLat,
  maxLat,
  minLng,
  maxLng,
  nodeTypes,
  lastSeen,
  region,
  enabled = true,
}: UseAllNeighborsParams) {
  return useQuery(
    NeighborsService.method.getAllNeighbors,
    {
      minLat: minLat ?? undefined,
      maxLat: maxLat ?? undefined,
      minLng: minLng ?? undefined,
      maxLng: maxLng ?? undefined,
      nodeTypes: nodeTypes ?? [],
      lastSeen: lastSeen ?? undefined,
      region,
    },
    {
      select: (res): AllNeighborsConnection[] =>
        res.neighbors.map((n) => ({
          source_node: n.sourceNode,
          target_node: n.targetNode,
          connection_type: n.connectionType,
          packet_count: n.packetCount,
          source_name: n.sourceName,
          source_latitude: n.sourceLatitude,
          source_longitude: n.sourceLongitude,
          source_has_location: n.sourceHasLocation,
          target_name: n.targetName,
          target_latitude: n.targetLatitude,
          target_longitude: n.targetLongitude,
          target_has_location: n.targetHasLocation,
        })),
      enabled,
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 15 * 60 * 1000, // 15 minutes
    },
  );
}
