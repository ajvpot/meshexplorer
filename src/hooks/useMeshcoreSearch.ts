import { useQuery } from '@tanstack/react-query';
import { buildApiUrl } from '../lib/api';

export interface MeshcoreSearchResult {
  public_key: string;
  node_name: string;
  latitude: number | null;
  longitude: number | null;
  has_location: number;
  is_repeater: number;
  is_chat_node: number;
  is_room_server: number;
  has_name: number;
  first_heard: string;
  last_seen: string;
  broker: string;
  topic: string;
}

export interface MeshcoreSearchResponse {
  results: MeshcoreSearchResult[];
  total: number;
  query: string;
  region: string | null;
  lastSeen: string | null;
  limit: number;
}

interface UseMeshcoreSearchParams {
  query: string;
  region?: string;
  lastSeen?: number | null;
  limit?: number;
  enabled?: boolean;
}

export function useMeshcoreSearch({ 
  query, 
  region, 
  lastSeen, 
  limit = 50, 
  enabled = true 
}: UseMeshcoreSearchParams) {
  return useQuery({
    queryKey: ['meshcore-search', query, region, lastSeen, limit],
    queryFn: async ({ signal }): Promise<MeshcoreSearchResponse> => {
      const params = new URLSearchParams();
      
      if (query.trim()) {
        params.append('q', query.trim());
      }
      if (region) {
        params.append('region', region);
      }
      if (lastSeen !== null && lastSeen !== undefined) {
        params.append('lastSeen', lastSeen.toString());
      }
      if (limit !== 50) {
        params.append('limit', limit.toString());
      }

      const url = `/api/meshcore/search${params.toString() ? `?${params.toString()}` : ''}`;
      
      const response = await fetch(buildApiUrl(url), {
        signal, // Use the AbortSignal from TanStack Query
      });
      
      if (!response.ok) {
        throw new Error(`Failed to search meshcore nodes: ${response.statusText}`);
      }
      
      return response.json();
    },
    enabled: enabled && query.trim().length > 0,
    staleTime: 30 * 1000, // 30 seconds - shorter for search results
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}
