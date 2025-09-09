"use client";

import { MeshcoreSearchResult } from '@/hooks/useMeshcoreSearch';
import { MapPinIcon, WifiIcon, ChatBubbleLeftRightIcon, ServerIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import moment from 'moment';

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
          <SearchResultItem key={node.public_key} node={node} />
        ))}
      </div>
    </div>
  );
}

function SearchResultItem({ node }: { node: MeshcoreSearchResult }) {
  const lastSeen = new Date(node.last_seen);
  const hasLocation = node.has_location === 1;
  const isRepeater = node.is_repeater === 1;
  const isChatNode = node.is_chat_node === 1;
  const isRoomServer = node.is_room_server === 1;

  return (
    <Link
      href={`/meshcore/node/${node.public_key}`}
      className="block bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700 p-4 hover:shadow-md dark:hover:shadow-lg transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 truncate">
              {node.node_name || 'Unnamed Node'}
            </h4>
            <div className="flex items-center gap-1">
              {isRepeater && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                  <WifiIcon className="h-3 w-3 mr-1" />
                  Repeater
                </span>
              )}
              {isChatNode && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                  <ChatBubbleLeftRightIcon className="h-3 w-3 mr-1" />
                  Chat
                </span>
              )}
              {isRoomServer && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                  <ServerIcon className="h-3 w-3 mr-1" />
                  Room Server
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            {hasLocation && node.latitude && node.longitude && (
              <div className="flex items-center gap-1">
                <MapPinIcon className="h-4 w-4" />
                <span>
                  {node.latitude.toFixed(4)}, {node.longitude.toFixed(4)}
                </span>
              </div>
            )}
            
            <div className="flex items-center gap-4">
              <span>Last seen: {moment(lastSeen).fromNow()}</span>
              <span className="text-xs font-mono text-gray-500 dark:text-gray-500">
                {node.public_key.substring(0, 8)}...
              </span>
            </div>

            <div className="text-xs text-gray-500 dark:text-gray-500">
              Topic: {node.topic} • Broker: {node.broker.split('://')[1]}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
