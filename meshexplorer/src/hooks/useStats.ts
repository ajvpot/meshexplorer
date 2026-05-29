import React from "react";
import { useQuery } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/api";

interface TotalNodesResponse {
  total_nodes: number;
}

interface NodesOverTimeRow {
  day: string;
  cumulative_unique_nodes: number;
  nodes_with_location: number;
  nodes_without_location: number;
  repeaters: number;
  room_servers: number;
}

interface NodesOverTimeResponse {
  data: NodesOverTimeRow[];
}

interface PopularChannelRow {
  channel_hash: string;
  message_count: number;
}

interface PopularChannelsResponse {
  data: PopularChannelRow[];
}

interface RepeaterPrefixRow {
  prefix: string;
  node_names: string[];
}

interface RepeaterPrefixesResponse {
  data: RepeaterPrefixRow[];
}

const STALE_TIME = 5 * 60 * 1000; // 5 minutes
const GC_TIME = 10 * 60 * 1000; // 10 minutes

export function useTotalNodes(region?: string) {
  return useQuery<TotalNodesResponse>({
    queryKey: ['stats', 'total-nodes', region],
    queryFn: async ({ signal }) => {
      const regionParam = region ? `?region=${encodeURIComponent(region)}` : '';
      const response = await fetch(buildApiUrl(`/api/stats/total-nodes${regionParam}`), {
        signal
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch total nodes: ${response.statusText}`);
      }
      
      return response.json();
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: 2,
  });
}

export function useNodesOverTime(region?: string) {
  return useQuery<NodesOverTimeResponse>({
    queryKey: ['stats', 'nodes-over-time', region],
    queryFn: async ({ signal }) => {
      const regionParam = region ? `?region=${encodeURIComponent(region)}` : '';
      const response = await fetch(buildApiUrl(`/api/stats/nodes-over-time${regionParam}`), {
        signal
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch nodes over time: ${response.statusText}`);
      }
      
      return response.json();
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: 2,
  });
}

export function usePopularChannels(region?: string) {
  return useQuery<PopularChannelsResponse>({
    queryKey: ['stats', 'popular-channels', region],
    queryFn: async ({ signal }) => {
      const regionParam = region ? `?region=${encodeURIComponent(region)}` : '';
      const response = await fetch(buildApiUrl(`/api/stats/popular-channels${regionParam}`), {
        signal
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch popular channels: ${response.statusText}`);
      }
      
      return response.json();
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: 2,
  });
}

export function useRepeaterPrefixes(region?: string) {
  return useQuery<RepeaterPrefixesResponse>({
    queryKey: ['stats', 'repeater-prefixes', region],
    queryFn: async ({ signal }) => {
      const regionParam = region ? `?region=${encodeURIComponent(region)}` : '';
      const response = await fetch(buildApiUrl(`/api/stats/repeater-prefixes${regionParam}`), {
        signal
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch repeater prefixes: ${response.statusText}`);
      }
      
      return response.json();
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: 2,
  });
}

export function useUnusedPrefixes(region?: string) {
  const { data: repeaterPrefixesData, isLoading, error } = useRepeaterPrefixes(region);
  
  const unusedPrefixes = React.useMemo(() => {
    if (!repeaterPrefixesData?.data) return [];
    
    // Generate all possible 2-character hex prefixes (01-FE, excluding 00 and FF)
    const allPrefixes = [];
    for (let i = 1; i < 255; i++) {
      allPrefixes.push(i.toString(16).padStart(2, '0').toUpperCase());
    }
    
    // Get used prefixes from the API response
    const usedPrefixes = new Set(repeaterPrefixesData.data.map(row => row.prefix));
    
    // Find unused prefixes
    return allPrefixes.filter(prefix => !usedPrefixes.has(prefix));
  }, [repeaterPrefixesData?.data]);
  
  return {
    data: unusedPrefixes,
    isLoading,
    error,
  };
}
