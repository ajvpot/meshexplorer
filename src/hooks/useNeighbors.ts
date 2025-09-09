import { useQuery } from '@tanstack/react-query';
import { buildApiUrl } from '../lib/api';

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
  return useQuery({
    queryKey: ['neighbors', nodeId, lastSeen],
    queryFn: async (): Promise<Neighbor[]> => {
      if (!nodeId) return [];
      
      const params = new URLSearchParams();
      if (lastSeen !== null && lastSeen !== undefined) {
        params.append('lastSeen', lastSeen.toString());
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
