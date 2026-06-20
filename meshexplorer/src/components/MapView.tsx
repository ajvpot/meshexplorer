"use client";
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { MapContainer, TileLayer, useMapEvents, Marker, Popup, MapContainerProps, useMap, Polyline } from "react-leaflet";
import { useRouter, useSearchParams } from "next/navigation";
import 'leaflet/dist/leaflet.css';
import L from "leaflet";
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useConfig, neighborMinConfidenceOf } from "./ConfigContext";
import RefreshButton from "@/components/RefreshButton";
import MapLayerSettingsComponent from "@/components/MapLayerSettings";
import { type MapLayerSettings } from "@/hooks/useMapLayerSettings";
import { NodeMarker, ClusterMarker, PopupContent } from "./MapIcons";
import { renderToString } from "react-dom/server";
import { buildApiUrl } from "@/lib/api";
import { NodePosition } from "@/types/map";
import { useNeighbors, type Neighbor } from "@/hooks/useNeighbors";
import { type AllNeighborsConnection } from "@/hooks/useAllNeighbors";
import { useQueryParams } from "@/hooks/useQueryParams";
import { useMapPosition } from "@/hooks/useMapPosition";

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
  showNodeNames?: boolean;
  enableClustering?: boolean;
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
  // Tracks the icon-affecting state last applied to this marker, so the update
  // effect can skip re-rendering the icon when nothing visible changed.
  const lastIconStateRef = useRef<string | null>(null);

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
    // Bind popup lazily: Leaflet calls this function only when the popup opens,
    // so we never render PopupContent for the thousands of markers that are
    // never clicked. Read the node from the marker so it reflects current data.
    marker.bindPopup((layer: any) =>
      renderToString(<PopupContent node={layer.options.nodeData} target={target} />)
    );

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
    if (!markerRef.current) return;

    // Keep the node reference on the marker fresh so the lazily-rendered popup
    // (bound above) reflects the latest data when opened.
    (markerRef.current as any).options.nodeData = node;

    // Only re-render the icon when something that affects its appearance has
    // actually changed for this node — avoids needless renderToString churn.
    const isSelected = selectedNodeId === node.node_id;
    const iconState = `${isSelected}|${showNodeNames}|${isSelected && isLoadingNeighbors}|${node.short_name ?? ''}|${node.name ?? ''}`;
    if (iconState === lastIconStateRef.current) return;
    lastIconStateRef.current = iconState;

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
  // node_id -> marker, for O(1) lookup when only the selected marker changes.
  const markerByIdRef = useRef<Map<string, L.Marker>>(new Map());
  // Selection/showNodeNames last applied across the group, so the update effect
  // can re-skin only the two markers whose selected state flipped.
  const prevSelectedRef = useRef<string | null>(null);
  const prevShowNamesRef = useRef<boolean>(showNodeNames);

  // Keep the callback ref updated
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  // Create cluster group only when map or nodes array changes
  useEffect(() => {
    if (!map) return;

    const markerById = new Map<string, L.Marker>();
    markerByIdRef.current = markerById;

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
      // Bind popup lazily so PopupContent is only rendered when the popup opens.
      marker.bindPopup((layer: any) =>
        renderToString(<PopupContent node={layer.options.nodeData} target={target} />)
      );

      // Add hover handler for meshcore nodes
      if (node.type === "meshcore") {
        marker.on('mouseover', () => {
          onNodeClickRef.current(node.node_id);
        });
      }

      markerById.set(node.node_id, marker);
      markers.addLayer(marker);
    });

    markers._isClusterLayer = true;
    map.addLayer(markers);
    clusterGroupRef.current = markers;
    // Markers were just rendered reflecting the current selection/labels, so
    // baseline the update effect's trackers to match this freshly-built group.
    prevSelectedRef.current = selectedNodeId;
    prevShowNamesRef.current = showNodeNames;

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

    const reskin = (marker: any) => {
      const nodeData = marker.options.nodeData;
      if (!nodeData) return;
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
    };

    // showNodeNames affects every marker's label, so it requires a full pass.
    // Otherwise, only the markers whose selected state flipped change
    // appearance (isLoadingNeighbors only affects the selected marker), so we
    // re-skin just those two instead of all ~5k.
    if (prevShowNamesRef.current !== showNodeNames) {
      clusterGroupRef.current.eachLayer(reskin);
    } else {
      const map = markerByIdRef.current;
      const prev = prevSelectedRef.current;
      if (prev && prev !== selectedNodeId) {
        const m = map.get(prev);
        if (m) reskin(m);
      }
      if (selectedNodeId) {
        const m = map.get(selectedNodeId);
        if (m) reskin(m);
      }
    }

    prevSelectedRef.current = selectedNodeId;
    prevShowNamesRef.current = showNodeNames;
  }, [showNodeNames, selectedNodeId, isLoadingNeighbors]);

  return null;
});

const ClusteredMarkers = React.memo(function ClusteredMarkers({ 
  nodes, 
  selectedNodeId, 
  onNodeClick, 
  isLoadingNeighbors = false, 
  target = '_self',
  showNodeNames = true,
  enableClustering = true
}: ClusteredMarkersProps) {

  if (!enableClustering) {
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
  nodes,
  strokeWidth = 2
}: { 
  selectedNodeId: string | null; 
  neighbors: Neighbor[]; 
  nodes: NodePosition[];
  strokeWidth?: number;
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
      return {
        neighbor,
        positions: [
          [selectedNode.latitude, selectedNode.longitude] as [number, number],
          [neighbor.latitude!, neighbor.longitude!] as [number, number]
        ],
        isNeighborVisible: !!neighborOnMap,
      };
    });

  // Color by derivation method, matching the "show all neighbors" layer.
  const methodColor = (method?: string) =>
    method === 'direct' ? '#8b5cf6'           // purple: literal MQTT-direct
    : method?.startsWith('anchor-') ? '#3b82f6' // blue: anchored
    : '#14b8a6';                                // teal: path-inferred

  return (
    <>
      {lines.map(({ neighbor, positions, isNeighborVisible }) => {
        const lineColor = isNeighborVisible ? methodColor(neighbor.method) : '#94a3b8';
        const opacity = Math.max(0.3, Math.min(0.9, 0.3 + 0.6 * (neighbor.confidence ?? 0.6)));

        return (
          <Polyline
            key={`${selectedNodeId}-${neighbor.public_key}`}
            positions={positions}
            pathOptions={{
              color: lineColor,
              weight: strokeWidth,
              opacity,
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
  nodes,
  useColors = true,
  minPacketCount = 1,
  strokeWidth = 2
}: {
  connections: AllNeighborsConnection[];
  nodes: NodePosition[];
  useColors?: boolean;
  minPacketCount?: number;
  strokeWidth?: number;
}) {
  if (connections.length === 0) return null;

  // Create a set of visible node IDs for quick lookup
  const visibleNodeIds = new Set(nodes.map(node => node.node_id));

  // Keep a line if EITHER endpoint is visible on the map, so connections that leave the viewport
  // (one node on-screen, the other off-screen) stay drawn. Each edge carries both endpoints'
  // coordinates, so the off-screen end renders fine. Confidence filtering happens server-side
  // (the confidence selector drives a refetch), so no client-side confidence filter here.
  const visibleConnections = connections.filter(connection =>
    (visibleNodeIds.has(connection.source_node) || visibleNodeIds.has(connection.target_node)) &&
    connection.packet_count >= minPacketCount
  );

  // Calculate logarithmic thresholds based on packet counts for path connections
  const pathConnections = visibleConnections.filter(conn => conn.connection_type === 'path');
  const packetCounts = pathConnections.map(conn => conn.packet_count).sort((a, b) => a - b);
  
  const getLogThresholds = (counts: number[]) => {
    if (counts.length === 0) return { min: 1, t1: 1, t2: 1, t3: 1, t4: 1, max: 1 };
    
    const min = Math.max(1, counts[0]); // Ensure minimum is at least 1 for log calculation
    const max = counts[counts.length - 1];
    
    if (min === max) {
      return { min, t1: min, t2: min, t3: min, t4: min, max };
    }
    
    // Use logarithmic scale to create thresholds
    const logMin = Math.log10(min);
    const logMax = Math.log10(max);
    const logRange = logMax - logMin;
    
    const t1 = Math.pow(10, logMin + logRange * 0.2);
    const t2 = Math.pow(10, logMin + logRange * 0.4);
    const t3 = Math.pow(10, logMin + logRange * 0.6);
    const t4 = Math.pow(10, logMin + logRange * 0.8);
    
    return { 
      min, 
      t1: Math.round(t1), 
      t2: Math.round(t2), 
      t3: Math.round(t3), 
      t4: Math.round(t4), 
      max 
    };
  };
  
  const thresholds = getLogThresholds(packetCounts);

  return (
    <>
      {visibleConnections.map((connection) => {
        const positions: [number, number][] = [
          [connection.source_latitude, connection.source_longitude],
          [connection.target_latitude, connection.target_longitude]
        ];
        
        // Color by derivation method; path-inferred edges use a logarithmic packet-count gradient.
        const getConnectionColor = (method: string, connectionType: string, packetCount: number) => {
          if (!useColors) {
            return method === 'direct' ? '#8b5cf6'
              : method.startsWith('anchor-') ? '#3b82f6'
              : '#6b7280'; // purple direct, blue anchor, gray path
          }

          if (method === 'direct') return '#8b5cf6';      // Purple for literal MQTT-direct edges
          if (method.startsWith('anchor-')) return '#3b82f6'; // Blue for anchored single-hop edges

          // For path-inferred connections, use logarithmic thresholds for color intensity
          if (packetCount >= thresholds.t4) return '#dc2626'; // Red for highest log range
          if (packetCount >= thresholds.t3) return '#ea580c'; // Dark orange
          if (packetCount >= thresholds.t2) return '#f59e0b'; // Orange
          if (packetCount >= thresholds.t1) return '#eab308'; // Yellow
          if (packetCount > thresholds.min) return '#84cc16';  // Light green for above minimum
          return '#6b7280'; // Gray for minimum traffic
        };

        const lineColor = getConnectionColor(connection.method, connection.connection_type, connection.packet_count);

        // Use strokeWidth setting for line weight; inferred (path) edges are drawn slightly thinner.
        const lineWeight = connection.connection_type === 'direct' ? strokeWidth : Math.max(1, strokeWidth - 1);
        // Fade lower-confidence edges so the trustworthy ones stand out.
        const lineOpacity = Math.max(0.25, Math.min(0.9, 0.25 + 0.65 * (connection.confidence ?? 0.5)));

        return (
          <Polyline
            key={`${connection.source_node}-${connection.target_node}-${connection.method}`}
            positions={positions}
            pathOptions={{
              color: lineColor,
              weight: lineWeight,
              opacity: lineOpacity,
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
  
  // Map layer settings state
  const [mapLayerSettings, setMapLayerSettings] = useState<MapLayerSettings>({
    showNodes: true,
    showNodeNames: true,
    enableClustering: true,
    tileLayer: "openstreetmap",
    grayscaleTiles: false,
    showAllNeighbors: false,
    useColors: true,
    nodeTypes: ["meshcore"],
    showMeshcoreCoverageOverlay: false,
    minPacketCount: 1,
    strokeWidth: 2,
  });
  
  // Use localStorage to persist map position
  const [mapPosition, setMapPosition] = useMapPosition();
  
  // Use query params for map position (for sharing URLs)
  const { query: mapQuery, updateQuery: updateMapQuery } = useQueryParams<MapQuery>({});
  
  // Determine map center and zoom: query params take priority over localStorage
  const mapCenter: [number, number] = [
    mapQuery.lat ?? mapPosition.lat,
    mapQuery.lng ?? mapPosition.lng
  ];
  const mapZoom = mapQuery.zoom ?? mapPosition.zoom;
  
  // Neighbor-related state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showAllNeighbors, setShowAllNeighbors] = useState<boolean>(false);
  const [allNeighborConnections, setAllNeighborConnections] = useState<AllNeighborsConnection[]>([]);
  const [allNeighborsLoading, setAllNeighborsLoading] = useState<boolean>(false);

  // Update showAllNeighbors when mapLayerSettings changes
  useEffect(() => {
    setShowAllNeighbors(mapLayerSettings.showAllNeighbors);
  }, [mapLayerSettings.showAllNeighbors]);
  
  // Use TanStack Query for neighbors data
  // Hover neighbors come from the same unified graph as "show all neighbors", filtered by the
  // user's global confidence preference, so the two views are consistent.
  const { data: neighbors = [], isLoading: neighborsLoading } = useNeighbors({
    nodeId: selectedNodeId,
    lastSeen: config?.lastSeen,
    mode: 'all',
    minConfidence: neighborMinConfidenceOf(config),
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
  const selectedTileLayer = tileLayerOptions[(mapLayerSettings.tileLayer as TileLayerKey) || 'openstreetmap'];

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
    if (mapLayerSettings.nodeTypes && mapLayerSettings.nodeTypes.length > 0) {
      for (const type of mapLayerSettings.nodeTypes) {
        params.push(`nodeTypes=${encodeURIComponent(type)}`);
      }
    }
    if (config?.lastSeen !== null && config?.lastSeen !== undefined) {
      params.push(`lastSeen=${config.lastSeen}`);
    }
    if (config?.selectedRegion) {
      params.push(`region=${encodeURIComponent(config.selectedRegion)}`);
    }
    if (includeNeighbors) {
      params.push('includeNeighbors=true');
      params.push(`minConfidence=${neighborMinConfidenceOf(config)}`);
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
  }, [mapLayerSettings.nodeTypes, config?.neighborMinConfidence, config?.lastSeen, config?.selectedRegion]);

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
        
        // Update localStorage with new map position
        setMapPosition({
          lat: Math.round(center.lat * 100000) / 100000, // Round to 5 decimal places
          lng: Math.round(center.lng * 100000) / 100000,
          zoom: zoom
        });
        
        // Update URL with new map position for sharing
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
          (lastResultCount > (mapLayerSettings.enableClustering ? 5000: 1000)) ||
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
        
        // Update localStorage with new map position
        setMapPosition({
          lat: Math.round(center.lat * 100000) / 100000, // Round to 5 decimal places
          lng: Math.round(center.lng * 100000) / 100000,
          zoom: zoom
        });
        
        // Update URL with new map position for sharing
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
          (!mapLayerSettings.enableClustering && lastResultCount > 1000) ||
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
  }, [bounds, mapLayerSettings.nodeTypes, config?.lastSeen, config?.selectedRegion, fetchNodes, showAllNeighbors]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Button Column */}
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 1000, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
        <RefreshButton
          onClick={() => bounds && fetchNodes(bounds, showAllNeighbors)}
          loading={loading || !bounds}
          title="Refresh map nodes"
          ariaLabel="Refresh map nodes"
        />
        <MapLayerSettingsComponent
          onSettingsChange={setMapLayerSettings}
        />
      </div>
        <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        style={{ width: "100%", height: "100%", zIndex: 1 }}
        className={`bg-gray-200${mapLayerSettings.grayscaleTiles ? ' grayscale-tiles' : ''}`}
      >
        <InitialBoundsSetter />
        <MapEventCatcher />
        <TileLayer
          attribution={selectedTileLayer.attribution}
          url={selectedTileLayer.url}
          maxZoom={selectedTileLayer.maxZoom}
          {...(selectedTileLayer.subdomains ? { subdomains: selectedTileLayer.subdomains } : {})}
        />
        {mapLayerSettings.showMeshcoreCoverageOverlay && (
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
        {mapLayerSettings.showNodes && (
          <ClusteredMarkers 
            nodes={nodePositions} 
            selectedNodeId={selectedNodeId}
            onNodeClick={handleNodeClick}
            isLoadingNeighbors={neighborsLoading}
            target={target}
            showNodeNames={mapLayerSettings.showNodeNames}
            enableClustering={mapLayerSettings.enableClustering}
          />
        )}
        <NeighborLines 
          selectedNodeId={selectedNodeId}
          neighbors={neighbors}
          nodes={nodePositions}
          strokeWidth={mapLayerSettings.strokeWidth}
        />
        {showAllNeighbors && (
          <AllNeighborLines
            connections={allNeighborConnections}
            nodes={nodePositions}
            useColors={mapLayerSettings.useColors}
            minPacketCount={mapLayerSettings.minPacketCount}
            strokeWidth={mapLayerSettings.strokeWidth}
          />
        )}
      </MapContainer>
      
      {/* Traffic Legend */}
      {showAllNeighbors && mapLayerSettings.useColors && allNeighborConnections.length > 0 && (() => {
        // At the top confidence notch only literal MQTT-direct edges are shown.
        const directOnly = neighborMinConfidenceOf(config) >= 1;
        const hasAnchor = allNeighborConnections.some(conn => conn.method?.startsWith('anchor-'));
        // Calculate logarithmic thresholds for legend display
        const pathConnections = allNeighborConnections.filter(conn => conn.connection_type === 'path');
        const packetCounts = pathConnections.map(conn => conn.packet_count).sort((a, b) => a - b);
        const legendThresholds = packetCounts.length > 0 ? (() => {
          const min = Math.max(1, packetCounts[0]);
          const max = packetCounts[packetCounts.length - 1];
          
          if (min === max) {
            return { min, t1: min, t2: min, t3: min, t4: min, max };
          }
          
          const logMin = Math.log10(min);
          const logMax = Math.log10(max);
          const logRange = logMax - logMin;
          
          return {
            min,
            t1: Math.round(Math.pow(10, logMin + logRange * 0.2)),
            t2: Math.round(Math.pow(10, logMin + logRange * 0.4)),
            t3: Math.round(Math.pow(10, logMin + logRange * 0.6)),
            t4: Math.round(Math.pow(10, logMin + logRange * 0.8)),
            max
          };
        })() : (directOnly ? { min: 1, t1: 1, t2: 1, t3: 1, t4: 1, max: 1 } : null);

        return legendThresholds && (
          <div style={{ 
            position: "absolute", 
            bottom: 16, 
            left: 16, 
            zIndex: 1000, 
            backgroundColor: 'rgba(255, 255, 255, 0.9)',
            padding: '12px',
            borderRadius: '8px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
            fontSize: '12px',
            fontFamily: 'monospace'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
              {directOnly ? 'Neighbors' : 'Path Traffic'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {!directOnly && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '2px', backgroundColor: '#dc2626' }}></div>
                    <span>High: {legendThresholds.t4}+ packets</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '2px', backgroundColor: '#ea580c' }}></div>
                    <span>Med-High: {legendThresholds.t3}-{legendThresholds.t4 - 1}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '2px', backgroundColor: '#f59e0b' }}></div>
                    <span>Medium: {legendThresholds.t2}-{legendThresholds.t3 - 1}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '2px', backgroundColor: '#eab308' }}></div>
                    <span>Low-Med: {legendThresholds.t1}-{legendThresholds.t2 - 1}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '2px', backgroundColor: '#84cc16' }}></div>
                    <span>Low: {legendThresholds.min + 1}-{legendThresholds.t1 - 1}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ width: '20px', height: '2px', backgroundColor: '#6b7280' }}></div>
                    <span>Minimal: {legendThresholds.min}</span>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', ...(directOnly ? {} : { marginTop: '4px', paddingTop: '4px', borderTop: '1px solid #e5e7eb' }) }}>
                <div style={{ width: '20px', height: '2px', backgroundColor: '#8b5cf6' }}></div>
                <span>MQTT direct</span>
              </div>
              {hasAnchor && !directOnly && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '20px', height: '2px', backgroundColor: '#3b82f6' }}></div>
                  <span>Anchored neighbor</span>
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
} 