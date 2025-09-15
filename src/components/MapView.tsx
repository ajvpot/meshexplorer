"use client";
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, useMapEvents, Marker, Popup, MapContainerProps, useMap, Polyline } from "react-leaflet";
import { useRouter, useSearchParams } from "next/navigation";
import 'leaflet/dist/leaflet.css';
import L from "leaflet";
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useConfig } from "./ConfigContext";
import RefreshButton from "@/components/RefreshButton";
import { NodeMarker, ClusterMarker, PopupContent } from "./MapIcons";
import { renderToString } from "react-dom/server";
import { buildApiUrl } from "@/lib/api";
import { NodePosition } from "@/types/map";
import { useNeighbors, type Neighbor } from "@/hooks/useNeighbors";
import { type AllNeighborsConnection } from "@/hooks/useAllNeighbors";
import { useQueryParams } from "@/hooks/useQueryParams";

const DEFAULT = {
  lat: 46.56, // Center between Seattle and Portland
  lng: -122.51,
  zoom: 7, // Zoom level to show both cities
};

interface MapQuery {
  lat?: number;
  lng?: number;
  zoom?: number;
}


type ClusteredMarkersProps = { 
  nodes: NodePosition[];
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string | null) => void;
  isLoadingNeighbors?: boolean;
  target?: '_blank' | '_self' | '_parent' | '_top';
};

// Individual marker component
const IndividualMarker = React.memo(function IndividualMarker({ 
  node, 
  showNodeNames, 
  selectedNodeId, 
  onNodeClick,
  isLoadingNeighbors = false,
  target = '_self'
}: { 
  node: NodePosition; 
  showNodeNames: boolean; 
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string | null) => void;
  isLoadingNeighbors?: boolean;
  target?: '_blank' | '_self' | '_parent' | '_top';
}) {
  const map = useMap();
  const markerRef = useRef<L.Marker | null>(null);
  const onNodeClickRef = useRef(onNodeClick);

  // Keep the callback ref updated
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    if (!map) return;

    const isSelected = selectedNodeId === node.node_id;
    const icon = L.divIcon({
      className: 'custom-node-marker-container',
      iconSize: [12, 24],
      iconAnchor: [6, 6],
      html: renderToString(
        <NodeMarker 
          node={node} 
          showNodeNames={showNodeNames} 
          isSelected={isSelected}
          isLoadingNeighbors={isSelected && isLoadingNeighbors}
        />
      ),
    });

    const marker = L.marker([node.latitude, node.longitude], { icon });
    (marker as any).options.nodeData = node;
    marker.bindPopup(renderToString(<PopupContent node={node} target={target} />));
    
    // Add hover handler for meshcore nodes
    if (node.type === "meshcore") {
      marker.on('mouseover', () => {
        onNodeClickRef.current(node.node_id);
      });
    }
    
    marker.addTo(map);
    markerRef.current = marker;

    return () => {
      if (markerRef.current && map.hasLayer(markerRef.current)) {
        map.removeLayer(markerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally omitting selectedNodeId, showNodeNames, isLoadingNeighbors to prevent marker recreation
  }, [map, node.node_id, node.latitude, node.longitude, node.type, target]);

  // Update marker when visual properties change (but don't recreate marker)
  useEffect(() => {
    if (markerRef.current) {
      // Update icon and popup content only
      const isSelected = selectedNodeId === node.node_id;
      const icon = L.divIcon({
        className: 'custom-node-marker-container',
        iconSize: [12, 24],
        iconAnchor: [6, 6],
        html: renderToString(
          <NodeMarker 
            node={node} 
            showNodeNames={showNodeNames} 
            isSelected={isSelected}
            isLoadingNeighbors={isSelected && isLoadingNeighbors}
          />
        ),
      });
      markerRef.current.setIcon(icon);
      markerRef.current.getPopup()?.setContent(renderToString(<PopupContent node={node} target={target} />));
    }
  }, [node, showNodeNames, selectedNodeId, isLoadingNeighbors]);

  // Handle position updates separately to avoid recreating marker
  useEffect(() => {
    if (markerRef.current) {
      const currentPos = markerRef.current.getLatLng();
      if (currentPos.lat !== node.latitude || currentPos.lng !== node.longitude) {
        markerRef.current.setLatLng([node.latitude, node.longitude]);
      }
    }
  }, [node.latitude, node.longitude]);

  return null;
});

// Clustered markers component
const ClusteredMarkersGroup = React.memo(function ClusteredMarkersGroup({ 
  nodes, 
  showNodeNames, 
  selectedNodeId, 
  onNodeClick,
  isLoadingNeighbors = false,
  target = '_self'
}: { 
  nodes: NodePosition[]; 
  showNodeNames: boolean; 
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string | null) => void;
  isLoadingNeighbors?: boolean;
  target?: '_blank' | '_self' | '_parent' | '_top';
}) {
  const map = useMap();
  const clusterGroupRef = useRef<any>(null);
  const onNodeClickRef = useRef(onNodeClick);

  // Keep the callback ref updated
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  // Create cluster group only when map or nodes array changes
  useEffect(() => {
    if (!map) return;

    const iconCreateFunction = (cluster: any) => {
      const children = cluster.getAllChildMarkers();
      return L.divIcon({
        html: renderToString(<ClusterMarker>{children}</ClusterMarker>),
        className: 'custom-cluster-icon',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });
    };

    const markers = (L as any).markerClusterGroup({
      iconCreateFunction,
      maxClusterRadius: 40,
    });

    nodes.forEach((node: NodePosition) => {
      const isSelected = selectedNodeId === node.node_id;
      const icon = L.divIcon({
        className: 'custom-node-marker-container',
        iconSize: [12, 24],
        iconAnchor: [6, 6],
        html: renderToString(
          <NodeMarker 
            node={node} 
            showNodeNames={showNodeNames} 
            isSelected={isSelected}
            isLoadingNeighbors={isSelected && isLoadingNeighbors}
          />
        ),
      });
      const marker = L.marker([node.latitude, node.longitude], { icon });
      (marker as any).options.nodeData = node;
      marker.bindPopup(renderToString(<PopupContent node={node} target={target} />));
      
      // Add hover handler for meshcore nodes
      if (node.type === "meshcore") {
        marker.on('mouseover', () => {
          onNodeClickRef.current(node.node_id);
        });
      }
      
      markers.addLayer(marker);
    });

    markers._isClusterLayer = true;
    map.addLayer(markers);
    clusterGroupRef.current = markers;

    return () => {
      if (clusterGroupRef.current && map.hasLayer(clusterGroupRef.current)) {
        map.removeLayer(clusterGroupRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Intentionally omitting selectedNodeId, showNodeNames, isLoadingNeighbors to prevent cluster recreation
  }, [map, nodes, target]);

  // Update marker appearances when visual properties change
  useEffect(() => {
    if (!clusterGroupRef.current) return;

    clusterGroupRef.current.eachLayer((marker: any) => {
      const nodeData = marker.options.nodeData;
      if (nodeData) {
        const isSelected = selectedNodeId === nodeData.node_id;
        const icon = L.divIcon({
          className: 'custom-node-marker-container',
          iconSize: [16, 32],
          iconAnchor: [8, 8],
          html: renderToString(
            <NodeMarker 
              node={nodeData} 
              showNodeNames={showNodeNames} 
              isSelected={isSelected}
              isLoadingNeighbors={isSelected && isLoadingNeighbors}
            />
          ),
        });
        marker.setIcon(icon);
        marker.getPopup()?.setContent(renderToString(<PopupContent node={nodeData} target={target} />));
      }
    });
  }, [showNodeNames, selectedNodeId, isLoadingNeighbors]);

  return null;
});

const ClusteredMarkers = React.memo(function ClusteredMarkers({ nodes, selectedNodeId, onNodeClick, isLoadingNeighbors = false, target = '_self' }: ClusteredMarkersProps) {
  const configResult = useConfig();
  const config = configResult?.config;
  const showNodeNames = config?.showNodeNames !== false;

  if (config?.clustering === false) {
    // Render individual marker components
    return (
      <>
        {nodes.map((node) => (
          <IndividualMarker 
            key={node.node_id} 
            node={node} 
            showNodeNames={showNodeNames}
            selectedNodeId={selectedNodeId}
            onNodeClick={onNodeClick}
            isLoadingNeighbors={isLoadingNeighbors}
            target={target}
          />
        ))}
      </>
    );
  } else {
    // Render clustered markers
    return (
      <ClusteredMarkersGroup 
        nodes={nodes} 
        showNodeNames={showNodeNames}
        selectedNodeId={selectedNodeId}
        onNodeClick={onNodeClick}
        isLoadingNeighbors={isLoadingNeighbors}
        target={target}
      />
    );
  }
});

// Component to render neighbor lines with directional arrows
function NeighborLines({ 
  selectedNodeId, 
  neighbors, 
  nodes 
}: { 
  selectedNodeId: string | null; 
  neighbors: Neighbor[]; 
  nodes: NodePosition[];
}) {
  if (!selectedNodeId || neighbors.length === 0) return null;

  // Find the selected node's position
  const selectedNode = nodes.find(node => node.node_id === selectedNodeId);
  if (!selectedNode) return null;

  // Create lines to neighbors that have location data and are visible on the map
  const lines = neighbors
    .filter(neighbor => neighbor.has_location && neighbor.latitude && neighbor.longitude)
    .map(neighbor => {
      // Check if the neighbor is also visible on the map
      const neighborOnMap = nodes.find(node => node.node_id === neighbor.public_key);
      
      const hasIncoming = neighbor.directions?.includes('incoming') || false;
      const hasOutgoing = neighbor.directions?.includes('outgoing') || false;
      const isBidirectional = hasIncoming && hasOutgoing;
      
      return {
        neighbor,
        positions: [
          [selectedNode.latitude, selectedNode.longitude] as [number, number],
          [neighbor.latitude!, neighbor.longitude!] as [number, number]
        ],
        isNeighborVisible: !!neighborOnMap,
        hasIncoming,
        hasOutgoing,
        isBidirectional
      };
    });


  return (
    <>
      {lines.map(({ neighbor, positions, isNeighborVisible, isBidirectional }) => {
        const lineColor = isNeighborVisible ? (isBidirectional ? '#10b981' : '#3b82f6') : '#94a3b8';
        
        return (
          <Polyline
            key={`${selectedNodeId}-${neighbor.public_key}`}
            positions={positions}
            pathOptions={{
              color: lineColor,
              weight: isBidirectional ? 3 : 2,
              opacity: 0.7,
              dashArray: isNeighborVisible ? undefined : '5, 5'
            }}
          />
        );
      })}
    </>
  );
}

// Component to render all neighbor lines for all nodes
function AllNeighborLines({ 
  connections, 
  nodes 
}: { 
  connections: AllNeighborsConnection[]; 
  nodes: NodePosition[];
}) {
  if (connections.length === 0) return null;

  // Create a set of visible node IDs for quick lookup
  const visibleNodeIds = new Set(nodes.map(node => node.node_id));

  // Filter connections to only show lines between nodes that are visible on the map
  const visibleConnections = connections.filter(connection => 
    visibleNodeIds.has(connection.source_node) && visibleNodeIds.has(connection.target_node)
  );

  return (
    <>
      {visibleConnections.map((connection) => {
        const positions: [number, number][] = [
          [connection.source_latitude, connection.source_longitude],
          [connection.target_latitude, connection.target_longitude]
        ];
        
        return (
          <Polyline
            key={`${connection.source_node}-${connection.target_node}`}
            positions={positions}
            pathOptions={{
              color: '#8b5cf6', // Purple color for all-neighbors view
              weight: 1,
              opacity: 0.5,
            }}
          />
        );
      })}
    </>
  );
}

interface MapViewProps {
  target?: '_blank' | '_self' | '_parent' | '_top';
}

export default function MapView({ target = '_self' }: MapViewProps = {}) {
  const [nodePositions, setNodePositions] = useState<NodePosition[]>([]);
  const [bounds, setBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastResultCount, setLastResultCount] = useState<number>(0);
  const fetchController = useRef<AbortController | null>(null);
  const lastRequestedBounds = useRef<[[number, number], [number, number]] | null>(null);
  const configResult = useConfig();
  const config = configResult?.config;
  
  // Use query params to persist map position
  const { query: mapQuery, updateQuery: updateMapQuery } = useQueryParams<MapQuery>({
    lat: DEFAULT.lat,
    lng: DEFAULT.lng,
    zoom: DEFAULT.zoom,
  });
  
  const mapCenter: [number, number] = [mapQuery.lat ?? DEFAULT.lat, mapQuery.lng ?? DEFAULT.lng];
  const mapZoom = mapQuery.zoom ?? DEFAULT.zoom;
  
  // Neighbor-related state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAllNeighbors, setShowAllNeighbors] = useState<boolean>(false);
  const [allNeighborConnections, setAllNeighborConnections] = useState<AllNeighborsConnection[]>([]);
  const [allNeighborsLoading, setAllNeighborsLoading] = useState<boolean>(false);
  
  // Use TanStack Query for neighbors data
  const { data: neighbors = [], isLoading: neighborsLoading } = useNeighbors({
    nodeId: selectedNodeId,
    lastSeen: config?.lastSeen,
    enabled: !!selectedNodeId
  });

  type TileLayerKey = 'openstreetmap' | 'opentopomap' | 'esri';
  const tileLayerOptions: Record<TileLayerKey, { url: string; attribution: string; maxZoom: number; subdomains?: string[] }> = {
    openstreetmap: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: 'Tiles &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 22,
    },
    opentopomap: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: 'Tiles &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 17,
    },
    esri: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: 'Tiles &copy; <a href="https://developers.arcgis.com/documentation/mapping-apis-and-services/deployment/basemap-attribution/">Esri</a>',
      maxZoom: 21,
    },
  };
  const selectedTileLayer = tileLayerOptions[(config?.tileLayer as TileLayerKey) || 'openstreetmap'];

  // Handle node hover
  const handleNodeClick = useCallback((nodeId: string | null) => {
    if (nodeId !== null && selectedNodeId !== nodeId) {
      // Mouse over new node - set new selection (TanStack Query will handle fetching)
      setSelectedNodeId(nodeId);
    }
    // Lines persist on mouseout and when hovering over same node
  }, [selectedNodeId]);

  const fetchNodes = useCallback((bounds?: [[number, number], [number, number]], includeNeighbors: boolean = false) => {
    if (fetchController.current) {
      fetchController.current.abort();
    }
    const controller = new AbortController();
    fetchController.current = controller;
    setLoading(true);
    if (includeNeighbors) {
      setAllNeighborsLoading(true);
    }
    
    let url = "/api/map";
    const params = [];
    if (bounds) {
      const [[minLat, minLng], [maxLat, maxLng]] = bounds;
      params.push(`minLat=${minLat}`);
      params.push(`maxLat=${maxLat}`);
      params.push(`minLng=${minLng}`);
      params.push(`maxLng=${maxLng}`);
    }
    if (config?.nodeTypes && config.nodeTypes.length > 0) {
      for (const type of config.nodeTypes) {
        params.push(`nodeTypes=${encodeURIComponent(type)}`);
      }
    }
    if (config?.lastSeen !== null && config?.lastSeen !== undefined) {
      params.push(`lastSeen=${config.lastSeen}`);
    }
    if (includeNeighbors) {
      params.push('includeNeighbors=true');
    }
    if (params.length > 0) {
      url += `?${params.join("&")}`;
    }
    
    fetch(buildApiUrl(url), { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          // Backward compatibility: just nodes array
          setNodePositions(data);
          setLastResultCount(data.length);
          if (includeNeighbors) {
            // If we expected neighbors but got just nodes, clear neighbors
            setAllNeighborConnections([]);
          }
        } else if (data && data.nodes && Array.isArray(data.nodes)) {
          // New format: object with nodes and neighbors
          setNodePositions(data.nodes);
          setLastResultCount(data.nodes.length);
          if (data.neighbors && Array.isArray(data.neighbors)) {
            setAllNeighborConnections(data.neighbors);
          } else {
            setAllNeighborConnections([]);
          }
        } else {
          setNodePositions([]);
          setAllNeighborConnections([]);
        }
        
        if (fetchController.current === controller) {
          setLoading(false);
          setAllNeighborsLoading(false);
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          setNodePositions([]);
          setAllNeighborConnections([]);
        }
        if (fetchController.current === controller) {
          setLoading(false);
          setAllNeighborsLoading(false);
        }
      });
  }, [config?.nodeTypes, config?.lastSeen]);

  function isBoundsInside(inner: [[number, number], [number, number]], outer: [[number, number], [number, number]]) {
    // inner: [[minLat, minLng], [maxLat, maxLng]]
    // outer: [[minLat, minLng], [maxLat, maxLng]]
    return (
      inner[0][0] >= outer[0][0] && // minLat
      inner[0][1] >= outer[0][1] && // minLng
      inner[1][0] <= outer[1][0] && // maxLat
      inner[1][1] <= outer[1][1]    // maxLng
    );
  }

  function MapEventCatcher() {
    useMapEvents({
      moveend: (e) => {
        const map = e.target;
        const center = map.getCenter();
        const zoom = map.getZoom();
        
        // Update URL with new map position
        updateMapQuery({
          lat: Math.round(center.lat * 100000) / 100000, // Round to 5 decimal places
          lng: Math.round(center.lng * 100000) / 100000,
          zoom: zoom
        });
        
        const b = map.getBounds();
        const buffer = 0.2; // 20% buffer
        const latDiff = b.getNorthEast().lat - b.getSouthWest().lat;
        const lngDiff = b.getNorthEast().lng - b.getSouthWest().lng;
        const newBounds: [[number, number], [number, number]] = [
          [
            b.getSouthWest().lat - latDiff * buffer,
            b.getSouthWest().lng - lngDiff * buffer,
          ],
          [
            b.getNorthEast().lat + latDiff * buffer,
            b.getNorthEast().lng + lngDiff * buffer,
          ],
        ];
        // Only always refetch if we have too many nodes depending on clustering setting.
        if (
          (lastResultCount > (config?.clustering ? 5000: 1000)) ||
          !lastRequestedBounds.current ||
          !isBoundsInside(newBounds, lastRequestedBounds.current)
        ) {
          setBounds(newBounds);
        }
      },
      zoomend: (e) => {
        const map = e.target;
        const center = map.getCenter();
        const zoom = map.getZoom();
        
        // Update URL with new map position
        updateMapQuery({
          lat: Math.round(center.lat * 100000) / 100000, // Round to 5 decimal places
          lng: Math.round(center.lng * 100000) / 100000,
          zoom: zoom
        });
        
        const b = map.getBounds();
        const buffer = 0.2; // 20% buffer
        const latDiff = b.getNorthEast().lat - b.getSouthWest().lat;
        const lngDiff = b.getNorthEast().lng - b.getSouthWest().lng;
        const newBounds: [[number, number], [number, number]] = [
          [
            b.getSouthWest().lat - latDiff * buffer,
            b.getSouthWest().lng - lngDiff * buffer,
          ],
          [
            b.getNorthEast().lat + latDiff * buffer,
            b.getNorthEast().lng + lngDiff * buffer,
          ],
        ];
        // Only always refetch if clustering is disabled and lastResultCount > 1000
        if (
          (config?.clustering === false && lastResultCount > 1000) ||
          !lastRequestedBounds.current ||
          !isBoundsInside(newBounds, lastRequestedBounds.current)
        ) {
          setBounds(newBounds);
        }
      },
    });
    return null;
  }

  // Set initial bounds on first render using the map instance
  function InitialBoundsSetter() {
    const map = useMap();
    useEffect(() => {
      if (!bounds && map) {
        const b = map.getBounds();
        setBounds([
          [b.getSouthWest().lat, b.getSouthWest().lng],
          [b.getNorthEast().lat, b.getNorthEast().lng],
        ]);
        map.attributionControl.setPrefix('map.w0z.is')
      }
    }, [map]);
    return null;
  }

  useEffect(() => {
    fetchController.current?.abort(); // abort any in-flight request on effect cleanup
    if (bounds) {
      fetchNodes(bounds, showAllNeighbors);
      lastRequestedBounds.current = bounds;
    } else {
      // Don't fetch until bounds is set
      setNodePositions([]);
      setAllNeighborConnections([]);
      lastRequestedBounds.current = null;
    }
    return () => {
      fetchController.current?.abort();
    };
  }, [bounds, config?.nodeTypes, config?.lastSeen, fetchNodes, showAllNeighbors]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Button Row */}
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 1000, display: 'flex', alignItems: 'center', gap: '8px' }}>
        <button
          onClick={() => {
            const newShowAllNeighbors = !showAllNeighbors;
            setShowAllNeighbors(newShowAllNeighbors);
            if (newShowAllNeighbors && bounds) {
              // Fetch with neighbors
              fetchNodes(bounds, true);
            } else if (!newShowAllNeighbors) {
              // Clear neighbors when hiding
              setAllNeighborConnections([]);
            }
          }}
          disabled={allNeighborsLoading}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            showAllNeighbors 
              ? 'bg-purple-600 text-white hover:bg-purple-700' 
              : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
          } ${allNeighborsLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          title={showAllNeighbors ? "Hide all neighbors" : "Show all neighbors"}
        >
          {allNeighborsLoading ? 'Loading...' : showAllNeighbors ? 'Hide All Neighbors' : 'Show All Neighbors'}
        </button>
        <RefreshButton
          onClick={() => bounds && fetchNodes(bounds, showAllNeighbors)}
          loading={loading || !bounds}
          title="Refresh map nodes"
          ariaLabel="Refresh map nodes"
        />
      </div>
        <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        style={{ width: "100%", height: "100%", zIndex: 1 }}
        className="bg-gray-200"
      >
        <InitialBoundsSetter />
        <MapEventCatcher />
        <TileLayer
          attribution={selectedTileLayer.attribution}
          url={selectedTileLayer.url}
          maxZoom={selectedTileLayer.maxZoom}
          {...(selectedTileLayer.subdomains ? { subdomains: selectedTileLayer.subdomains } : {})}
        />
        {config?.showMeshcoreCoverageOverlay && (
          <TileLayer
            url="https://tiles.w0z.is/tiles/{z}/{x}/{y}.png"
            attribution="Meshcore Coverage &copy; <a href='https://w0z.is/'>w0z.is</a>"
            minZoom={1}
            maxZoom={22}
            minNativeZoom={8}
            maxNativeZoom={8}
            zIndex={1000}
            opacity={0.7}
          />
        )}
        <ClusteredMarkers 
          nodes={nodePositions} 
          selectedNodeId={selectedNodeId}
          onNodeClick={handleNodeClick}
          isLoadingNeighbors={neighborsLoading}
          target={target}
        />
        <NeighborLines 
          selectedNodeId={selectedNodeId}
          neighbors={neighbors}
          nodes={nodePositions}
        />
        {showAllNeighbors && (
          <AllNeighborLines 
            connections={allNeighborConnections}
            nodes={nodePositions}
          />
        )}
      </MapContainer>
    </div>
  );
} 