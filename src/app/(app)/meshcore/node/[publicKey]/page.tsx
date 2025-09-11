"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import moment from "moment";
import { formatPublicKey } from "@/lib/meshcore";
import { getNameIconLabel } from "@/lib/meshcore-map-nodeutils";
import PathDisplay from "@/components/PathDisplay";
import AdvertDetails from "@/components/AdvertDetails";
import ContactQRCode from "@/components/ContactQRCode";
import { useConfig, LAST_SEEN_OPTIONS } from "@/components/ConfigContext";
import { useNeighbors, type Neighbor } from "@/hooks/useNeighbors";
import { useNodeData, type NodeData, type NodeInfo, type Advert, type LocationHistory, type MqttInfo, type NodeError } from "@/hooks/useNodeData";
import { ArrowRightEndOnRectangleIcon, ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/outline";
import { RegionProvider } from "@/contexts/RegionContext";

// Interfaces are now imported from useNodeData hook

// Function to determine node type based on capabilities
function getNodeType(node: NodeInfo): number {
  if (node.is_chat_node) return 1; // companion
  if (node.is_repeater) return 2; // repeater
  if (node.is_room_server) return 3; // room
  return 4; // sensor (default for standard nodes)
}

export default function MeshcoreNodePage() {
  const params = useParams();
  const publicKey = params.publicKey as string;
  const { config } = useConfig();

  // Use TanStack Query for node data
  const { 
    data: nodeData, 
    isLoading: loading, 
    error: queryError 
  } = useNodeData({
    publicKey: publicKey,
    enabled: !!publicKey
  });

  // Use TanStack Query for neighbors data - fetch for all nodes
  const { 
    data: neighbors = [], 
    isLoading: neighborsLoading 
  } = useNeighbors({
    nodeId: publicKey,
    lastSeen: config.lastSeen,
    enabled: !!publicKey
  });

  // Extract error information from TanStack Query error
  const error = queryError?.error || null;
  const errorCode = queryError?.code || null;


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
    const getErrorIcon = (code: string | null) => {
      switch (code) {
        case "NODE_NOT_FOUND":
          return "🔍";
        case "INVALID_PUBLIC_KEY":
        case "MISSING_PUBLIC_KEY":
          return "❌";
        case "SERVICE_UNAVAILABLE":
        case "DATABASE_ERROR":
          return "🔧";
        case "NETWORK_ERROR":
          return "🌐";
        default:
          return "⚠️";
      }
    };

    const getErrorTitle = (code: string | null) => {
      switch (code) {
        case "NODE_NOT_FOUND":
          return "Node Not Found";
        case "INVALID_PUBLIC_KEY":
        case "MISSING_PUBLIC_KEY":
          return "Invalid Public Key";
        case "SERVICE_UNAVAILABLE":
        case "DATABASE_ERROR":
          return "Service Unavailable";
        case "NETWORK_ERROR":
          return "Connection Error";
        default:
          return "Error";
      }
    };

    const getErrorDescription = (code: string | null, publicKey: string) => {
      switch (code) {
        case "NODE_NOT_FOUND":
          return (
            <div className="space-y-2">
              <p className="text-gray-600 dark:text-gray-300">
                The node with public key <code className="bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded text-sm font-mono">{formatPublicKey(publicKey)}</code> was not found in the database.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                This could mean the node has never been seen on the mesh network, or the public key is incorrect.
              </p>
            </div>
          );
        case "INVALID_PUBLIC_KEY":
        case "MISSING_PUBLIC_KEY":
          return (
            <div className="space-y-2">
              <p className="text-gray-600 dark:text-gray-300">
                The provided public key is invalid or missing.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Please check the URL and try again with a valid public key.
              </p>
            </div>
          );
        case "SERVICE_UNAVAILABLE":
        case "DATABASE_ERROR":
          return (
            <div className="space-y-2">
              <p className="text-gray-600 dark:text-gray-300">
                The database is temporarily unavailable.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Please try again in a few moments.
              </p>
            </div>
          );
        case "NETWORK_ERROR":
          return (
            <div className="space-y-2">
              <p className="text-gray-600 dark:text-gray-300">
                Unable to connect to the server.
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Please check your internet connection and try again.
              </p>
            </div>
          );
        default:
          return <p className="text-gray-600 dark:text-gray-300">{error}</p>;
      }
    };

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-neutral-800 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="text-6xl mb-4">{getErrorIcon(errorCode)}</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            {getErrorTitle(errorCode)}
          </h1>
          {getErrorDescription(errorCode, publicKey)}
          
          <div className="mt-6 space-y-3">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Try Again
            </button>
            
            <div className="text-sm">
              <Link
                href="/"
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
              >
                ← Back to Mesh Explorer
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!nodeData) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-neutral-800 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-600 dark:text-gray-300">No data available</div>
        </div>
      </div>
    );
  }

  const { node, recentAdverts, locationHistory, mqtt, region } = nodeData;

  return (
    <RegionProvider region={region}>
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
                {region && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Region: <span className="font-medium capitalize">{region}</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-2 mt-2">
                  {node.is_repeater && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                      Repeater
                    </span>
                  ) || null}
                  {node.is_chat_node && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                      Companion
                    </span>
                  ) || null}
                  {node.is_room_server && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                      Room Server
                    </span>
                  ) || null}
                  {!node.is_repeater && !node.is_chat_node && !node.is_room_server && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Unknown
                    </span>
                  ) || null}
                </div>
              </div>
              <div className="text-right">
                <ContactQRCode
                  name={node.has_name ? node.node_name : "Unknown Node"}
                  publicKey={node.public_key}
                  type={getNodeType(node)}
                  size={150}
                />
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
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Public Key</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100 font-mono break-all">
                  {node.public_key}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">First Seen</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  <div className="space-y-1">
                    <div>
                      {moment.utc(node.first_seen).format('YYYY-MM-DD HH:mm:ss')} UTC
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">
                      {moment.utc(node.first_seen).local().fromNow()}
                    </div>
                  </div>
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Seen</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  <div className="space-y-1">
                    <div>
                      {moment.utc(node.last_seen).format('YYYY-MM-DD HH:mm:ss')} UTC
                    </div>
                    <div className="text-gray-500 dark:text-gray-400">
                      {moment.utc(node.last_seen).local().fromNow()}
                    </div>
                  </div>
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
              <div className="sm:col-span-2">
                <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">MQTT Uplink</dt>
                <dd className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                  <div className="flex items-center space-x-2 mb-2">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      mqtt.is_uplinked 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' 
                        : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                    }`}>
                      {mqtt.is_uplinked ? 'Connected' : 'Not Connected'}
                    </span>
                  </div>
                  
                  {mqtt.topics && mqtt.topics.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300">Topics:</h4>
                      <div className="space-y-1">
                        {mqtt.topics.map((topic, index) => (
                          <div key={index} className="flex items-center justify-between text-xs bg-gray-50 dark:bg-neutral-800 rounded px-2 py-1">
                            <div className="flex-1">
                              <span className="font-mono text-gray-900 dark:text-gray-100">{topic.topic}</span>
                              <span className="text-gray-500 dark:text-gray-400 ml-2">({topic.broker})</span>
                            </div>
                            <div className="text-right">
                              <div className="text-gray-900 dark:text-gray-100">
                                {moment.utc(topic.last_packet_time).format('MM-DD HH:mm')}
                              </div>
                              <div className="text-gray-500 dark:text-gray-400">
                                {moment.utc(topic.last_packet_time).local().fromNow()}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) || null}
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
              <p className="text-sm text-gray-500 dark:text-gray-400">Latest {recentAdverts.length} adverts</p>
            </div>
            <div className="p-6 space-y-4">
              {recentAdverts.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No adverts found
                </div>
              ) : (
                recentAdverts.map((advert) => (
                  <AdvertDetails key={advert.group_id} advert={advert} initiatingNodeKey={node.public_key} />
                ))
              )}
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

        {/* Neighbors Section - Show for all nodes */}
        <div className="mt-6 bg-white dark:bg-neutral-900 shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                Neighbors ({neighborsLoading ? "..." : neighbors.length})
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Nodes heard directly by this node
                {config.lastSeen !== null && (
                  <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Last {(() => {
                      const option = LAST_SEEN_OPTIONS.find(opt => opt.value === config.lastSeen);
                      return option ? option.label : `${Math.floor(config.lastSeen / 3600)}h`;
                    })()}
                  </span>
                )}
              </p>
            </div>
            <div className="p-6">
              {neighborsLoading ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                  Loading neighbors...
                </div>
              ) : neighbors.length === 0 ? (
                <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                  No neighbors found
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {neighbors.map((neighbor) => (
                    <div key={neighbor.public_key} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {neighbor.has_name ? getNameIconLabel(neighbor.node_name) : "Unknown Node"}
                          </h3>
                          {neighbor.has_name && (
                            <p className="text-xs text-gray-600 dark:text-gray-300 truncate">
                              {neighbor.node_name}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                            {formatPublicKey(neighbor.public_key)}
                          </p>
                        </div>
                        <a
                          href={`/meshcore/node/${neighbor.public_key}`}
                          className="ml-2 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs font-medium"
                        >
                          View →
                        </a>
                      </div>
                      
                      <div className="flex flex-wrap gap-1 mb-2">
                        {neighbor.is_repeater && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                            Repeater
                          </span>
                        ) || null}
                        {neighbor.is_chat_node && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                            Companion
                          </span>
                        ) || null}
                        {neighbor.is_room_server && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                            Room
                          </span>
                        ) || null}
                      </div>
                      
                      <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                        {neighbor.has_location && neighbor.latitude && neighbor.longitude && (
                          <div>
                            Location: {neighbor.latitude.toFixed(4)}, {neighbor.longitude.toFixed(4)}
                          </div>
                        ) || null}
                        {neighbor.directions && neighbor.directions.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span>Direction:</span>
                            {neighbor.directions.includes('incoming') && <ArrowRightEndOnRectangleIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" title="Incoming - This node hears the neighbor" />}
                            {neighbor.directions.includes('outgoing') && <ArrowRightStartOnRectangleIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" title="Outgoing - The neighbor hears this node" />}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
      </div>
    </div>
    </RegionProvider>
  );
}
