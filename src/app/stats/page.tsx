"use client";

import { useEffect, useState } from "react";
import { buildApiUrl } from "@/lib/api";
import { useConfig } from "@/components/ConfigContext";
import { getRegionConfig } from "@/lib/regions";

export default function StatsPage() {
  const { config } = useConfig();
  const [totalNodes, setTotalNodes] = useState<number | null>(null);
  const [nodesOverTime, setNodesOverTime] = useState<any[]>([]);
  const [popularChannels, setPopularChannels] = useState<any[]>([]);
  const [repeaterPrefixes, setRepeaterPrefixes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setLoading(true);

      // Build API URLs with region parameter if selected
      const regionParam = config?.selectedRegion
        ? `?region=${encodeURIComponent(config.selectedRegion)}`
        : "";

      const [totalNodesRes, nodesOverTimeRes, popularChannelsRes, repeaterPrefixesRes] =
        await Promise.all([
          fetch(buildApiUrl(`/api/stats/total-nodes${regionParam}`)).then((r) => r.json()),
          fetch(buildApiUrl(`/api/stats/nodes-over-time${regionParam}`)).then((r) => r.json()),
          fetch(buildApiUrl(`/api/stats/popular-channels${regionParam}`)).then((r) => r.json()),
          fetch(buildApiUrl(`/api/stats/repeater-prefixes${regionParam}`)).then((r) => r.json()),
        ]);
      if (!ignore) {
        setTotalNodes(totalNodesRes.total_nodes ?? null);
        setNodesOverTime(nodesOverTimeRes.data ?? []);
        setPopularChannels(popularChannelsRes.data ?? []);
        setRepeaterPrefixes(repeaterPrefixesRes.data ?? []);
        setLoading(false);
      }
    }

    let ignore = false;
    fetchStats();
    return () => {
      ignore = true;
    };
  }, [config, config?.selectedRegion]);

  // Get the friendly name for the selected region
  const regionFriendlyName = config?.selectedRegion
    ? getRegionConfig(config.selectedRegion)?.friendlyName || config.selectedRegion
    : null;

  return (
    <div className="max-w-2xl w-full mx-auto my-4 py-2 px-4 text-gray-800 dark:text-gray-200 bg-white dark:bg-neutral-900 rounded-lg shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">MeshCore Network Stats</h1>
        {regionFriendlyName && (
          <div className="text-sm text-gray-500 dark:text-gray-400">{regionFriendlyName}</div>
        )}
      </div>
      {loading ? (
        <div>Loading...</div>
      ) : (
        <>
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Total Unique Nodes</h2>
            <div className="text-3xl font-mono">{totalNodes}</div>
          </div>

          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-2">Nodes Heard Over Time</h2>
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
                      <td className="border px-3 py-2 text-center">
                        {row.cumulative_unique_nodes}
                      </td>
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
            <h2 className="text-lg font-semibold mb-2">Most Popular Channels</h2>
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
            <h2 className="text-lg font-semibold mb-2">Used Repeater Prefixes</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              Shows repeater nodes grouped by the first byte of their public key, seen within the
              last 7 days.
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
                              {name || "Unnamed Node"}
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
        </>
      )}
    </div>
  );
}
