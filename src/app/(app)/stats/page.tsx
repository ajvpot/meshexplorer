"use client";

import { useEffect } from "react";
import { useConfig } from "@/components/ConfigContext";
import { getRegionConfig } from "@/lib/regions";
import { 
  useTotalNodes, 
  useNodesOverTime, 
  usePopularChannels, 
  useRepeaterPrefixes, 
  useUnusedPrefixes 
} from "@/hooks/useStats";
import Link from "next/link";

// Component for anchor links next to section headings
function AnchorLink({ id }: { id: string }) {
  return (
    <Link
      href={`#${id}`}
      className="ml-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity"
    >
      #
    </Link>
  );
}

export default function StatsPage() {
  const { config } = useConfig();
  const region = config?.selectedRegion;
  
  // Use TanStack Query hooks for data fetching
  const totalNodesQuery = useTotalNodes(region);
  const nodesOverTimeQuery = useNodesOverTime(region);
  const popularChannelsQuery = usePopularChannels(region);
  const repeaterPrefixesQuery = useRepeaterPrefixes(region);
  const unusedPrefixesQuery = useUnusedPrefixes(region);
  
  // Combine loading states - show loading if any query is loading
  const isLoading = totalNodesQuery.isLoading || 
                   nodesOverTimeQuery.isLoading || 
                   popularChannelsQuery.isLoading || 
                   repeaterPrefixesQuery.isLoading;
  
  // Combine error states
  const error = totalNodesQuery.error || 
               nodesOverTimeQuery.error || 
               popularChannelsQuery.error || 
               repeaterPrefixesQuery.error;
  
  // Extract data with fallbacks
  const totalNodes = totalNodesQuery.data?.total_nodes ?? null;
  const nodesOverTime = nodesOverTimeQuery.data?.data ?? [];
  const popularChannels = popularChannelsQuery.data?.data ?? [];
  const repeaterPrefixes = repeaterPrefixesQuery.data?.data ?? [];
  const unusedPrefixes = unusedPrefixesQuery.data ?? [];

  // Get the friendly name for the selected region
  const regionFriendlyName = config?.selectedRegion 
    ? getRegionConfig(config.selectedRegion)?.friendlyName || config.selectedRegion
    : null;

  // Handle scrolling to anchor after data loads
  useEffect(() => {
    if (!isLoading && !error) {
      // Small delay to ensure DOM is fully rendered
      const timer = setTimeout(() => {
        const hash = window.location.hash;
        if (hash) {
          const element = document.getElementById(hash.substring(1));
          if (element) {
            element.scrollIntoView({ behavior: 'smooth' });
          }
        }
      }, 100);
      
      return () => clearTimeout(timer);
    }
  }, [isLoading, error]);

  return (
    <div className="max-w-2xl w-full mx-auto my-4 py-2 px-4 text-gray-800 dark:text-gray-200 bg-white dark:bg-neutral-900 rounded-lg shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">MeshCore Network Stats</h1>
        {regionFriendlyName && (
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {regionFriendlyName}
          </div>
        )}
      </div>
      {error ? (
        <div className="text-red-600 dark:text-red-400">
          <h2 className="text-lg font-semibold mb-2">Error Loading Stats</h2>
          <p>{error.message || 'An error occurred while loading statistics.'}</p>
        </div>
      ) : isLoading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Loading statistics...</p>
        </div>
      ) : (
        <>
          <div className="mb-6">
            <div className="group flex items-center">
              <h2 id="total-nodes" className="text-lg font-semibold mb-2">Total Unique Nodes</h2>
              <AnchorLink id="total-nodes" />
            </div>
            <div className="text-3xl font-mono">{totalNodes}</div>
          </div>

          <div className="mb-6">
            <div className="group flex items-center">
              <h2 id="nodes-over-time" className="text-lg font-semibold mb-2">Nodes Heard Over Time</h2>
              <AnchorLink id="nodes-over-time" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Shows nodes heard within the last 7 days by date.
            </p>
            <div className="w-full overflow-x-auto">
              <table className="w-full text-sm border rounded">
                <thead>
                  <tr className="bg-gray-100 dark:bg-gray-800 font-semibold">
                    <th className="border px-3 py-2 text-center min-w-[120px]">Day</th>
                    <th className="border px-3 py-2 text-center">Total Nodes</th>
                    <th className="border px-3 py-2 text-center">With Location</th>
                    <th className="border px-3 py-2 text-center">Without Location</th>
                    <th className="border px-3 py-2 text-center">Repeaters</th>
                    <th className="border px-3 py-2 text-center">Room Servers</th>
                  </tr>
                </thead>
                <tbody>
                  {nodesOverTime.map((row, i) => (
                    <tr key={i} className="border-t">
                      <td className="border px-3 py-2 text-center min-w-[120px]">{row.day}</td>
                      <td className="border px-3 py-2 text-center">{row.cumulative_unique_nodes}</td>
                      <td className="border px-3 py-2 text-center">{row.nodes_with_location}</td>
                      <td className="border px-3 py-2 text-center">{row.nodes_without_location}</td>
                      <td className="border px-3 py-2 text-center">{row.repeaters}</td>
                      <td className="border px-3 py-2 text-center">{row.room_servers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="mb-6">
            <div className="group flex items-center">
              <h2 id="popular-channels" className="text-lg font-semibold mb-2">Most Popular Channels</h2>
              <AnchorLink id="popular-channels" />
            </div>
            <table className="w-full text-sm border">
              <thead>
                <tr>
                  <th className="border px-2 py-1">Channel Hash</th>
                  <th className="border px-2 py-1">Message Count</th>
                </tr>
              </thead>
              <tbody>
                {popularChannels.map((row, i) => (
                  <tr key={i}>
                    <td className="border px-2 py-1">{row.channel_hash}</td>
                    <td className="border px-2 py-1">{row.message_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-6">
            <div className="group flex items-center">
              <h2 id="used-prefixes" className="text-lg font-semibold mb-2">Used Repeater Prefixes</h2>
              <AnchorLink id="used-prefixes" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Shows repeater nodes grouped by the first byte of their public key, seen within the last 2 days.
            </p>
            <table className="w-full text-sm border">
              <thead>
                <tr>
                  <th className="border px-2 py-1">Prefix</th>
                  <th className="border px-2 py-1">Node Names</th>
                </tr>
              </thead>
              <tbody>
                {repeaterPrefixes.map((row, i) => (
                  <tr key={i}>
                    <td className="border px-2 py-1 font-mono">{row.prefix}</td>
                    <td className="border px-2 py-1">
                      {row.node_names && row.node_names.length > 0 ? (
                        <div className="space-y-1">
                          {row.node_names.map((name: string, j: number) => (
                            <div key={j} className="text-xs">
                              {name || 'Unnamed Node'}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-500">No named nodes</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mb-6">
            <div className="group flex items-center">
              <h2 id="unused-prefixes" className="text-lg font-semibold mb-2">Unused Repeater Prefixes</h2>
              <AnchorLink id="unused-prefixes" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Public key prefixes that are not currently used by any repeater nodes. Click to generate a key.
            </p>
            <div className="grid grid-cols-8 sm:grid-cols-12 md:grid-cols-16 lg:grid-cols-20 gap-1">
              {unusedPrefixes.map((prefix) => (
                <a
                  key={prefix}
                  href={`https://gessaman.com/mc-keygen/?prefix=${prefix}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-center p-1 bg-gray-100 dark:bg-gray-800 rounded border hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                  title={`Click to generate a key with prefix ${prefix}`}
                >
                  {prefix}
                </a>
              ))}
            </div>
            <div className="mt-2 text-sm text-gray-600 dark:text-gray-400">
              Total unused prefixes: {unusedPrefixes.length} out of 254 possible (excluding 00 and FF)
            </div>
          </div>
        </>
      )}
    </div>
  );
} 