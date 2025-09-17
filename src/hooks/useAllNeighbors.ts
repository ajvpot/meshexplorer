import { useQuery } from '@tanstack/react-query';
import { buildApiUrl } from '@/lib/api';

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
  enabled = true 
}: UseAllNeighborsParams) {
  return useQuery({
    queryKey: ['allNeighbors', minLat, maxLat, minLng, maxLng, nodeTypes, lastSeen, region],
    queryFn: async (): Promise<AllNeighborsConnection[]> => {
      const params = new URLSearchParams();
      
      if (minLat !== null && minLat !== undefined) {
        params.append('minLat', minLat.toString());
      }
      if (maxLat !== null && maxLat !== undefined) {
        params.append('maxLat', maxLat.toString());
      }
      if (minLng !== null && minLng !== undefined) {
        params.append('minLng', minLng.toString());
      }
      if (maxLng !== null && maxLng !== undefined) {
        params.append('maxLng', maxLng.toString());
      }
      if (nodeTypes && nodeTypes.length > 0) {
        nodeTypes.forEach(type => params.append('nodeTypes', type));
      }
      if (lastSeen !== null && lastSeen !== undefined) {
        params.append('lastSeen', lastSeen.toString());
      }
      if (region) {
        params.append('region', region);
      }
      
      const url = `/api/neighbors/all${params.toString() ? `?${params.toString()}` : ''}`;
      
      const response = await fetch(buildApiUrl(url));
      if (!response.ok) {
        throw new Error(`Failed to fetch all neighbors: ${response.statusText}`);
      }
      
      return response.json();
    },
    enabled: enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes (shorter than individual neighbors since this is more expensive)
    gcTime: 15 * 60 * 1000, // 15 minutes
  });
}

