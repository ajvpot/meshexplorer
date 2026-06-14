import { useQuery } from "@tanstack/react-query";
import { buildApiUrl } from "@/lib/api";
import type { RegionGroup } from "@/lib/regionGroups";

export interface RegionOption {
  name: string;
  friendlyName: string;
  nodeCount?: number;
  lastSeen?: string;
}

interface RegionsResponse {
  regions: RegionOption[];
  groups: RegionGroup[];
}

const STALE_TIME = 60 * 60 * 1000; // 1h — the region set is slow-moving / MV-backed
const GC_TIME = 2 * 60 * 60 * 1000;

// Single shared query (one network request) feeding both useRegions() and useRegionGroups().
function useRegionsQuery() {
  return useQuery<RegionsResponse>({
    queryKey: ["regions"],
    queryFn: async ({ signal }) => {
      const response = await fetch(buildApiUrl("/api/regions"), { signal });
      if (!response.ok) {
        throw new Error(`Failed to fetch regions: ${response.statusText}`);
      }
      return response.json();
    },
    staleTime: STALE_TIME,
    gcTime: GC_TIME,
    retry: 2,
  });
}

export function useRegions() {
  const { data, isLoading, error } = useRegionsQuery();
  return { regions: data?.regions ?? [], isLoading, error };
}

export function useRegionGroups() {
  const { data, isLoading, error } = useRegionsQuery();
  return { groups: data?.groups ?? [], isLoading, error };
}
