import React from "react";
import { useQuery } from "@connectrpc/connect-query";
import { StatsService } from "@/gen/meshexplorer/v1/stats_pb";

const STALE_TIME = 5 * 60 * 1000; // 5 minutes
const GC_TIME = 10 * 60 * 1000; // 10 minutes

export function useTotalNodes(region?: string) {
  return useQuery(
    StatsService.method.getTotalNodes,
    { region },
    { staleTime: STALE_TIME, gcTime: GC_TIME, retry: 2 },
  );
}

export function useNodesOverTime(region?: string) {
  return useQuery(
    StatsService.method.getNodesOverTime,
    { region },
    { staleTime: STALE_TIME, gcTime: GC_TIME, retry: 2 },
  );
}

export function usePopularChannels(region?: string) {
  return useQuery(
    StatsService.method.getPopularChannels,
    { region },
    { staleTime: STALE_TIME, gcTime: GC_TIME, retry: 2 },
  );
}

export function useRepeaterPrefixes(region?: string) {
  return useQuery(
    StatsService.method.getRepeaterPrefixes,
    { region },
    { staleTime: STALE_TIME, gcTime: GC_TIME, retry: 2 },
  );
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
    const usedPrefixes = new Set(repeaterPrefixesData.data.map((row) => row.prefix));

    // Find unused prefixes
    return allPrefixes.filter((prefix) => !usedPrefixes.has(prefix));
  }, [repeaterPrefixesData?.data]);

  return {
    data: unusedPrefixes,
    isLoading,
    error,
  };
}
