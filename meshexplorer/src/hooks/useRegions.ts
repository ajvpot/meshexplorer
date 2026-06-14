import { useQuery } from "@connectrpc/connect-query";
import { RegionsService } from "@/gen/meshexplorer/v1/regions_pb";

const STALE_TIME = 60 * 60 * 1000; // 1h — the region set is slow-moving / MV-backed
const GC_TIME = 2 * 60 * 60 * 1000;

// Single shared query (one network request) feeding both useRegions() and useRegionGroups().
function useRegionsQuery() {
  return useQuery(
    RegionsService.method.getRegions,
    {},
    { staleTime: STALE_TIME, gcTime: GC_TIME, retry: 2 },
  );
}

export function useRegions() {
  const { data, isLoading, error } = useRegionsQuery();
  return { regions: data?.regions ?? [], isLoading, error };
}

export function useRegionGroups() {
  const { data, isLoading, error } = useRegionsQuery();
  return { groups: data?.groups ?? [], isLoading, error };
}
