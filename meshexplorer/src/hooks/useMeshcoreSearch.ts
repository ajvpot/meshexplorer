import { useQuery, useQueries } from '@tanstack/react-query';
import { create, windowScheduler, indexedResolver } from '@yornaath/batshit';
import { nodeClient } from '@/lib/connect/client';
import type { SearchResult } from '@/gen/meshexplorer/v1/node_pb';
import { useMemo } from 'react';

export interface MeshcoreSearchResponse {
  results: SearchResult[];
  total: number;
}

// Search query parameters
export interface SearchQuery {
  query?: string;
  region?: string;
  lastSeen?: number | null;
  limit?: number;
  exact?: boolean;
  is_repeater?: boolean;
}

// Create batcher using batshit with simple index-based resolver
const searchBatcher = create({
  fetcher: async (queries: SearchQuery[]) => {
    const normalizedQueries = queries.map(q => ({
      query: (typeof q.query === 'string' ? q.query.trim() : String(q.query || '').trim()) || "",
      region: q.region || undefined,
      lastSeen: q.lastSeen !== null && q.lastSeen !== undefined ? q.lastSeen : undefined,
      limit: q.limit || 50,
      exact: q.exact || false,
      is_repeater: q.is_repeater
    }));

    // Create AbortController for this batch
    const abortController = new AbortController();

    // Store the abort controller so individual queries can cancel the batch
    (searchBatcher as any)._currentAbortController = abortController;

    const response = await nodeClient.searchNodes(
      {
        queries: normalizedQueries.map((q) => ({
          query: q.query,
          region: q.region,
          lastSeen: q.lastSeen,
          limit: q.limit,
          exact: q.exact,
          isRepeater: q.is_repeater,
        })),
      },
      { signal: abortController.signal },
    );

    // Return results with batch context for resolver (array-of-arrays, one per query)
    return {
      results: response.results.map((list) => list.results),
      queries: queries
    };
  },

  resolver: (batchData: {results: SearchResult[][], queries: SearchQuery[]}, query: SearchQuery) => {
    const index = batchData.queries.findIndex(q => JSON.stringify(q) === JSON.stringify(query));
    return batchData.results[index] || [];
  },
  
  scheduler: windowScheduler(100)
});

// Hook parameters
interface UseMeshcoreSearchParams {
  query: string;
  region?: string;
  lastSeen?: number | null;
  limit?: number;
  exact?: boolean;
  is_repeater?: boolean;
  enabled?: boolean;
}

export function useMeshcoreSearch({ 
  query, 
  region, 
  lastSeen, 
  limit = 50, 
  exact = false,
  is_repeater,
  enabled = true 
}: UseMeshcoreSearchParams) {
  // Stabilize the search query object to prevent unnecessary re-renders
  const trimmedQuery = typeof query === 'string' ? query.trim() : String(query || '').trim();
  const searchQuery: SearchQuery = useMemo(() => ({
    query: trimmedQuery,
    region,
    lastSeen,
    limit,
    exact,
    is_repeater
  }), [trimmedQuery, region, lastSeen, limit, exact, is_repeater]);

  return useQuery({
    queryKey: ['meshcore-search', searchQuery.query, region, lastSeen, limit, exact, is_repeater],
    queryFn: async ({ signal }): Promise<MeshcoreSearchResponse> => {
      // Set up cancellation handler
      const handleAbort = () => {
        const abortController = (searchBatcher as any)._currentAbortController;
        if (abortController) {
          abortController.abort();
        }
      };
      
      signal?.addEventListener('abort', handleAbort);
      
      try {
        const queryResults = await searchBatcher.fetch(searchQuery) as SearchResult[] || [];
        return {
          results: queryResults,
          total: queryResults.length
        };
      } finally {
        signal?.removeEventListener('abort', handleAbort);
      }
    },
    enabled: enabled && (typeof query === 'string' ? query.trim() : String(query || '').trim()).length > 0,
    staleTime: 1000, // Reduce stale time to be more responsive to typing
    gcTime: 30 * 1000, // Reduce garbage collection time
    retry: 1,
    refetchOnWindowFocus: false, // Prevent duplicate requests on focus
  });
}

// Hook for multiple searches using useQueries
interface UseMeshcoreSearchesParams {
  searches: Array<{
    query: string;
    region?: string;
    lastSeen?: number | null;
    limit?: number;
    exact?: boolean;
    is_repeater?: boolean;
    enabled?: boolean;
  }>;
}

export function useMeshcoreSearches({ searches }: UseMeshcoreSearchesParams) {
  // Create query configurations for useQueries
  const queryConfigs = useMemo(() => 
    searches.map((searchParams, index) => {
      const {
        query,
        region,
        lastSeen,
        limit = 50,
        exact = false,
        is_repeater,
        enabled = true
      } = searchParams;

      const trimmedQuery = typeof query === 'string' ? query.trim() : String(query || '').trim();
      const searchQuery: SearchQuery = {
        query: trimmedQuery,
        region,
        lastSeen,
        limit,
        exact,
        is_repeater
      };

      return {
        queryKey: ['meshcore-search-batch', trimmedQuery, region, lastSeen, limit, exact, is_repeater],
        queryFn: async ({ signal }: { signal?: AbortSignal }): Promise<MeshcoreSearchResponse> => {
          // Set up cancellation handler
          const handleAbort = () => {
            const abortController = (searchBatcher as any)._currentAbortController;
            if (abortController) {
              abortController.abort();
            }
          };
          
          signal?.addEventListener('abort', handleAbort);
          
          try {
            const queryResults = await searchBatcher.fetch(searchQuery) as SearchResult[] || [];
            return {
              results: queryResults,
              total: queryResults.length
            };
          } finally {
            signal?.removeEventListener('abort', handleAbort);
          }
        },
        enabled: enabled && trimmedQuery.length > 0,
        staleTime: 1000,
        gcTime: 30 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      };
    })
  , [searches]);

  return useQueries({
    queries: queryConfigs
  });
}
