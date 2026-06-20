import { useQuery } from '@tanstack/react-query';
import { buildApiUrl } from '@/lib/api';

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
  directions?: string[]; // only present in 'direct' mode
  // present in 'all' mode (unified neighbor graph)
  method?: string;
  confidence?: number;
  connection_type?: string;
  packet_count?: number;
}

interface UseNeighborsParams {
  nodeId: string | null;
  lastSeen?: number | null;
  // 'direct' (default) = legacy direct adjacency with incoming/outgoing; 'all' = unified neighbor
  // graph (same edges as the map's "show all neighbors") filtered by minConfidence.
  mode?: 'direct' | 'all';
  minConfidence?: number | null;
  enabled?: boolean;
}

export function useNeighbors({ nodeId, lastSeen, mode = 'direct', minConfidence, enabled = true }: UseNeighborsParams) {
  return useQuery({
    queryKey: ['neighbors', nodeId, lastSeen, mode, minConfidence],
    queryFn: async (): Promise<Neighbor[]> => {
      if (!nodeId) return [];

      const params = new URLSearchParams();
      if (lastSeen !== null && lastSeen !== undefined) {
        params.append('lastSeen', lastSeen.toString());
      }
      if (mode === 'all') {
        params.append('mode', 'all');
        if (minConfidence !== null && minConfidence !== undefined) {
          params.append('minConfidence', minConfidence.toString());
        }
      }
      const url = `/api/meshcore/node/${nodeId}/neighbors${params.toString() ? `?${params.toString()}` : ''}`;
      
      const response = await fetch(buildApiUrl(url));
      if (!response.ok) {
        throw new Error(`Failed to fetch neighbors: ${response.statusText}`);
      }
      
      return response.json();
    },
    enabled: enabled && !!nodeId,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
}
