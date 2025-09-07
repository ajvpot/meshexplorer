"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import moment from "moment";
import { formatPublicKey } from "@/lib/meshcore";
import { getNameIconLabel } from "@/lib/meshcore-map-nodeutils";

interface NodeInfo {
  public_key: string;
  node_name: string;
  latitude: number | null;
  longitude: number | null;
  has_location: number;
  is_repeater: number;
  is_chat_node: number;
  is_room_server: number;
  has_name: number;
  last_seen: string;
}

interface Advert {
  mesh_timestamp: string;
  path: string;
  path_len: number;
  latitude: number | null;
  longitude: number | null;
  is_repeater: number;
  is_chat_node: number;
  is_room_server: number;
  has_location: number;
  origin_pubkey: string;
  full_path: string;
}

interface LocationHistory {
  mesh_timestamp: string;
  latitude: number;
  longitude: number;
  path: string;
  path_len: number;
  origin_pubkey: string;
  full_path: string;
}

interface MqttInfo {
  is_uplinked: boolean;
  last_uplink_time: string | null;
  has_packets: boolean;
}

interface NodeData {
  node: NodeInfo;
  recentAdverts: Advert[];
  locationHistory: LocationHistory[];
  mqtt: MqttInfo;
}

export default function MeshcoreNodePage() {
  const params = useParams();
  const publicKey = params.publicKey as string;
  const [nodeData, setNodeData] = useState<NodeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!publicKey) return;

    const fetchNodeData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/meshcore/node/${publicKey}`);
        
        if (response.status === 404) {
          setError("Node not found");
          return;
        }
        
        if (!response.ok) {
          throw new Error("Failed to fetch node data");
        }
        
        const data = await response.json();
        setNodeData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchNodeData();
  }, [publicKey]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-neutral-800 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-300">Loading node information...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-neutral-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 dark:text-red-400 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">Error</h1>
          <p className="text-gray-600 dark:text-gray-300">{error}</p>
        </div>
      </div>
    );
  }

  if (!nodeData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-neutral-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-600 dark:text-gray-300 text-6xl mb-4">❓</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">No Data</h1>
          <p className="text-gray-600 dark:text-gray-300">No node data available</p>
        </div>
      </div>
    );
  }

  const { node, recentAdverts, locationHistory, mqtt } = nodeData;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-800 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white dark:bg-neutral-900 shadow rounded-lg mb-6">
          <div className="px-6 py-8">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                  {node.has_name ? getNameIconLabel(node.node_name) : "Unknown Node"}
                </h1>
                {node.has_name && (
                  <p className="text-lg text-gray-700 dark:text-gray-300 mb-2">
                    {node.node_name}
                  </p>
                )}
                <p className="text-gray-600 dark:text-gray-300 font-mono text-sm">
                  {formatPublicKey(node.public_key)}
                </p>
              </div>
              <div className="text-right">
                <div className="flex space-x-2 mb-2">
                  {node.is_repeater && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      Repeater
                    </span>
                  )}
                  {node.is_chat_node && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      Chat Node
                    </span>
                  )}
                  {node.is_room_server && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                      Room Server
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Last seen: {moment.utc(node.last_seen).format('YYYY-MM-DD HH:mm:ss')} UTC
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Node Details */}
        <div className="mb-6 bg-white dark:bg-neutral-900 shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Node Details</h2>
          </div>
          <div className="px-6 py-4">
            <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Public Key</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
                  {node.public_key}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Node Name</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {node.has_name ? node.node_name : "Not set"}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Location</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {node.has_location && node.latitude && node.longitude ? (
                    <span>
                      {node.latitude.toFixed(6)}, {node.longitude.toFixed(6)}
                    </span>
                  ) : (
                    "No location data"
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Seen</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  {moment.utc(node.last_seen).format('YYYY-MM-DD HH:mm:ss')} UTC
                  <br />
                  <span className="text-gray-500 dark:text-gray-400">
                    {moment.utc(node.last_seen).local().fromNow()}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">MQTT Uplink</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  <div className="flex items-center space-x-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      mqtt.is_uplinked 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}>
                      {mqtt.is_uplinked ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                  {mqtt.has_packets && mqtt.last_uplink_time && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Last packet: {moment.utc(mqtt.last_uplink_time).format('YYYY-MM-DD HH:mm:ss')} UTC
                      <br />
                      <span className="text-gray-400">
                        {moment.utc(mqtt.last_uplink_time).local().fromNow()}
                      </span>
                    </div>
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Adverts */}
          <div className="bg-white dark:bg-neutral-900 shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Recent Adverts</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Latest {recentAdverts.length} adverts with path information</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-neutral-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Timestamp</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Path</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Length</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Location</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {recentAdverts.map((advert, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {moment.utc(advert.mesh_timestamp).format('MM-DD HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 font-mono">
                        {advert.full_path ? advert.full_path.match(/.{1,2}/g)?.join(' ') || advert.full_path : "-"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {advert.path_len}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {advert.latitude && advert.longitude ? (
                          <span>
                            {advert.latitude.toFixed(4)}, {advert.longitude.toFixed(4)}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <div className="flex space-x-1">
                          {advert.is_repeater && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              R
                            </span>
                          )}
                          {advert.is_chat_node && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                              C
                            </span>
                          )}
                          {advert.is_room_server && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                              S
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Location History */}
          <div className="bg-white dark:bg-neutral-900 shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">Location History</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Recent location updates (last 30 days)</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-neutral-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Timestamp</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Latitude</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Longitude</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {locationHistory.map((location, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {moment.utc(location.mesh_timestamp).format('MM-DD HH:mm:ss')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {location.latitude.toFixed(6)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                        {location.longitude.toFixed(6)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
