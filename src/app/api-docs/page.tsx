import React from 'react';

export default function ApiDocsPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-neutral-800 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white dark:bg-neutral-900 shadow rounded-lg">
          <div className="px-6 py-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">MeshExplorer API Documentation</h1>
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border-l-4 border-yellow-400 dark:border-yellow-500 p-4 mb-8">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">
                    <strong>Note:</strong> This documentation may be out of date as the project is continuously improving. 
                    For the most up-to-date information, please refer to the source code or contact the development team.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-12">
              {/* Chat API */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Chat API</h2>
                <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">GET /api/chat</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">Retrieve chat messages from the mesh network.</p>
                  
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Query Parameters</h4>
                  <p className="text-gray-600 dark:text-gray-300 mb-4 text-sm">Note: Array parameters like <code className="bg-gray-200 dark:bg-neutral-700 px-1 rounded text-gray-800 dark:text-gray-200">privateKeys</code> can be specified multiple times in the URL (e.g., <code className="bg-gray-200 dark:bg-neutral-700 px-1 rounded text-gray-800 dark:text-gray-200">?privateKeys=key1&privateKeys=key2</code>).</p>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-neutral-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Parameter</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Required</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-neutral-800 divide-y divide-gray-200 dark:divide-gray-700">
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">limit</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">number</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Number of messages to return (default: 20)</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">before</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">string</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Get messages before this timestamp</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">after</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">string</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Get messages after this timestamp</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">channel_id</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">string</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Filter by specific channel hash</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">region</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">string</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Filter by geographic region</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">decrypt</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">boolean</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Enable message decryption (any value present)</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">privateKeys</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">string[]</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Array of private keys for decryption (can be specified multiple times)</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2 mt-6">Response Format</h4>
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-green-400 dark:text-green-300 text-sm">
{`// Without decryption
[
  {
    "ingest_timestamp": "2024-01-01T12:00:00Z",
    "mesh_timestamp": "2024-01-01T12:00:00Z",
    "channel_hash": "a1",
    "mac": "b2c3",
    "encrypted_message": "hex_encoded_data",
    "message_count": 123,
    "origin_key_path_array": [["origin", "pubkey", "path"]]
  }
]

// With decryption (decrypt=true)
[
  {
    "ingest_timestamp": "2024-01-01T12:00:00Z",
    "mesh_timestamp": "2024-01-01T12:00:00Z",
    "channel_hash": "a1",
    "mac": "b2c3",
    "encrypted_message": "hex_encoded_data",
    "message_count": 123,
    "origin_key_path_array": [["origin", "pubkey", "path"]],
    "decrypted": {
      "timestamp": 1704110400,
      "msgType": 1,
      "sender": "username",
      "text": "Hello world!",
      "rawText": "username: Hello world!"
    }
  }
]`}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Map API */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Map API</h2>
                <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">GET /api/map</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">Retrieve node positions for map visualization.</p>
                  
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Query Parameters</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-neutral-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Parameter</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Required</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-neutral-800 divide-y divide-gray-200 dark:divide-gray-700">
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">minLat</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">number</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Minimum latitude for bounding box</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">maxLat</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">number</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Maximum latitude for bounding box</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">minLng</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">number</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Minimum longitude for bounding box</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">maxLng</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">number</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Maximum longitude for bounding box</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">nodeTypes</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">string[]</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Filter by node types (can be specified multiple times)</td>
                        </tr>
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">lastSeen</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">number</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Filter by last seen time in seconds</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2 mt-6">Response Format</h4>
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-green-400 dark:text-green-300 text-sm">
{`[
  {
    "node_id": "abc123...",
    "name": "Node Name",
    "short_name": "NODE",
    "latitude": 40.7128,
    "longitude": -74.0060,
    "last_seen": "2024-01-01T12:00:00Z",
    "first_seen": "2024-01-01T10:00:00Z",
    "type": "meshcore"
  }
]`}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Meshcore Node API */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Meshcore Node API</h2>
                <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-6 mb-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">GET /api/meshcore/node/{`{publicKey}`}</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">Retrieve detailed information about a specific meshcore node including recent adverts and location history.</p>
                  
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Path Parameters</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-neutral-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Parameter</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Required</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-neutral-800 divide-y divide-gray-200 dark:divide-gray-700">
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">publicKey</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">string</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">Yes</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">The public key of the meshcore node</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2 mt-6">Query Parameters</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-neutral-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Parameter</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Required</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-neutral-800 divide-y divide-gray-200 dark:divide-gray-700">
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">limit</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">number</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Number of recent adverts to return (default: 50)</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2 mt-6">Response Format</h4>
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-green-400 dark:text-green-300 text-sm">
{`{
  "node": {
    "public_key": "82D396A8754609E302A2A3FDB9210A1C67C7081606C16A89F77AD75C16E1DA1A",
    "node_name": "🌲 Tree Room (hello)",
    "latitude": 47.54969,
    "longitude": -122.28085999999999,
    "has_location": 1,
    "is_repeater": 1,
    "is_chat_node": 1,
    "is_room_server": 0,
    "has_name": 1,
    "last_seen": "2025-09-07T00:59:18"
  },
  "recentAdverts": [
    {
      "mesh_timestamp": "2025-09-07T00:59:18",
      "path": "7ffb7e",
      "path_len": 3,
      "latitude": 47.54969,
      "longitude": -122.28085999999999,
      "is_repeater": 1,
      "is_chat_node": 1,
      "is_room_server": 0,
      "has_location": 1
    }
  ],
  "locationHistory": [
    {
      "mesh_timestamp": "2025-09-07T00:59:18",
      "latitude": 47.54969,
      "longitude": -122.28085999999999,
      "path": "7ffb7e",
      "path_len": 3
    }
  ]
}`}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Stats APIs */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Stats APIs</h2>
                
                {/* Total Nodes */}
                <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-6 mb-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">GET /api/stats/total-nodes</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">Get the total number of nodes in the network.</p>
                  
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Query Parameters</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-neutral-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Parameter</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Required</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-neutral-800 divide-y divide-gray-200 dark:divide-gray-700">
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">region</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">string</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Filter by geographic region</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2 mt-6">Response Format</h4>
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-green-400 dark:text-green-300 text-sm">
{`{
  "total_nodes": 1234
}`}
                    </pre>
                  </div>
                </div>

                {/* Nodes Over Time */}
                <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-6 mb-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">GET /api/stats/nodes-over-time</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">Get cumulative node statistics over time with a 7-day rolling window.</p>
                  
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Query Parameters</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-neutral-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Parameter</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Required</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-neutral-800 divide-y divide-gray-200 dark:divide-gray-700">
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">region</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">string</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Filter by geographic region</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2 mt-6">Response Format</h4>
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-green-400 dark:text-green-300 text-sm">
{`{
  "data": [
    {
      "day": "2024-01-01",
      "cumulative_unique_nodes": 100,
      "nodes_with_location": 80,
      "nodes_without_location": 20,
      "repeaters": 15,
      "room_servers": 5
    }
  ]
}`}
                    </pre>
                  </div>
                </div>

                {/* Popular Channels */}
                <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-6 mb-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">GET /api/stats/popular-channels</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">Get the most popular channels by message count (top 10).</p>
                  
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Query Parameters</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-neutral-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Parameter</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Required</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-neutral-800 divide-y divide-gray-200 dark:divide-gray-700">
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">region</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">string</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Filter by geographic region</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2 mt-6">Response Format</h4>
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-green-400 dark:text-green-300 text-sm">
{`{
  "data": [
    {
      "channel_hash": "a1",
      "message_count": 1234
    }
  ]
}`}
                    </pre>
                  </div>
                </div>

                {/* Repeater Prefixes */}
                <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-6">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">GET /api/stats/repeater-prefixes</h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">Get repeater node statistics grouped by public key prefix (first 2 characters).</p>
                  
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Query Parameters</h4>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                      <thead className="bg-gray-50 dark:bg-neutral-700">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Parameter</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Required</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Description</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-neutral-800 divide-y divide-gray-200 dark:divide-gray-700">
                        <tr>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">region</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">string</td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">No</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">Filter by geographic region</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2 mt-6">Response Format</h4>
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-green-400 dark:text-green-300 text-sm">
{`{
  "data": [
    {
      "prefix": "ab",
      "node_count": 15,
      "node_names": ["Node1", "Node2", "Node3"]
    }
  ]
}`}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Error Handling */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Error Handling</h2>
                <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-6">
                  <p className="text-gray-600 dark:text-gray-300 mb-4">All API endpoints return appropriate HTTP status codes and error messages:</p>
                  <ul className="list-disc list-inside text-gray-600 dark:text-gray-300 space-y-2">
                    <li><strong>200 OK:</strong> Successful request</li>
                    <li><strong>500 Internal Server Error:</strong> Server error with descriptive message</li>
                  </ul>
                  
                  <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2 mt-4">Error Response Format</h4>
                  <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                    <pre className="text-red-400 dark:text-red-300 text-sm">
{`{
  "error": "Failed to fetch data"
}`}
                    </pre>
                  </div>
                </div>
              </section>

              {/* Examples */}
              <section>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4">Example Requests</h2>
                <div className="space-y-4">
                  <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Get recent chat messages with decryption</h3>
                    <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-blue-400 dark:text-blue-300 text-sm">
{`GET /api/chat?decrypt=true&limit=10&privateKeys=key1&privateKeys=key2`}
                      </pre>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Get nodes in a specific region</h3>
                    <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-blue-400 dark:text-blue-300 text-sm">
{`GET /api/map?minLat=40.0&maxLat=41.0&minLng=-74.0&maxLng=-73.0&nodeTypes=meshcore`}
                      </pre>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Get total nodes in a region</h3>
                    <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-blue-400 dark:text-blue-300 text-sm">
{`GET /api/stats/total-nodes?region=us-east`}
                      </pre>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-6">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Get meshcore node details</h3>
                    <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 overflow-x-auto">
                      <pre className="text-blue-400 dark:text-blue-300 text-sm">
{`GET /api/meshcore/node/82D396A8754609E302A2A3FDB9210A1C67C7081606C16A89F77AD75C16E1DA1A?limit=100`}
                      </pre>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
