"use client";

import { MeshcoreSearchResult } from '@/hooks/useMeshcoreSearch';
import { WifiIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import NodeCard from '@/components/NodeCard';

interface SearchResultsProps {
  results: MeshcoreSearchResult[];
  isLoading: boolean;
  error: Error | null;
  query: string;
  total: number;
}

export default function SearchResults({ results, isLoading, error, query, total }: SearchResultsProps) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700 p-4">
              <div className="h-4 bg-gray-200 dark:bg-neutral-700 rounded w-3/4 mb-2"></div>
              <div className="h-3 bg-gray-200 dark:bg-neutral-700 rounded w-1/2 mb-2"></div>
              <div className="h-3 bg-gray-200 dark:bg-neutral-700 rounded w-1/4"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <div className="text-red-500 dark:text-red-400 mb-2">
          <WifiIcon className="h-12 w-12 mx-auto mb-2" />
          <p className="text-lg font-medium">Search Error</p>
        </div>
        <p className="text-gray-600 dark:text-gray-400">
          Failed to search nodes. Please try again.
        </p>
      </div>
    );
  }

  if (!query.trim()) {
    return (
      <div className="text-center py-12">
        <MagnifyingGlassIcon className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          Search MeshCore Nodes
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          Enter a node name or public key to search for nodes
        </p>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="text-center py-12">
        <WifiIcon className="h-16 w-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
          No Results Found
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          No nodes found for &quot;{query}&quot;. Try a different search term.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
          Search Results
        </h3>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {total} {total === 1 ? 'node' : 'nodes'} found
        </span>
      </div>

      <div className="space-y-3">
        {results.map((node) => (
          <NodeCard key={node.public_key} node={node} />
        ))}
      </div>
    </div>
  );
}

