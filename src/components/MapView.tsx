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
import { buildApiUrl } from "../lib/api";
import { NodePosition } from "../types/map";
import { useNeighbors, type Neighbor } from "../hooks/useNeighbors";

const DEFAULT = {
  lat: 46.56, // Center between Seattle and Portland
  lng: -122.51,
  zoom: 7, // Zoom level to show both cities
};


type ClusteredMarkersProps = { 
  nodes: NodePosition[];
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string | null) => void;
};

// Individual marker component
function IndividualMarker({ 
  node, 
  showNodeNames, 
  selectedNodeId, 
  onNodeClick 
}: { 
  node: NodePosition; 
  showNodeNames: boolean; 
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string | null) => void;
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

    const icon = L.divIcon({
      className: 'custom-node-marker-container',
      iconSize: [16, 32],
      iconAnchor: [8, 8],
      html: renderToString(<NodeMarker node={node} showNodeNames={showNodeNames} />),
    });

    const marker = L.marker([node.latitude, node.longitude], { icon });
    (marker as any).options.nodeData = node;
    marker.bindPopup(renderToString(<PopupContent node={node} />));
    
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
  }, [map, node, showNodeNames]);

  // Update marker when node data changes
  useEffect(() => {
    if (markerRef.current) {
      const currentPos = markerRef.current.getLatLng();
      if (currentPos.lat !== node.latitude || currentPos.lng !== node.longitude) {
        markerRef.current.setLatLng([node.latitude, node.longitude]);
      }
      
      // Update icon and popup
      const icon = L.divIcon({
        className: 'custom-node-marker-container',
        iconSize: [16, 32],
        iconAnchor: [8, 8],
        html: renderToString(<NodeMarker node={node} showNodeNames={showNodeNames} />),
      });
      markerRef.current.setIcon(icon);
      markerRef.current.getPopup()?.setContent(renderToString(<PopupContent node={node} />));
    }
  }, [node, showNodeNames]);

  return null;
}

// Clustered markers component
function ClusteredMarkersGroup({ 
  nodes, 
  showNodeNames, 
  selectedNodeId, 
  onNodeClick 
}: { 
  nodes: NodePosition[]; 
  showNodeNames: boolean; 
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string | null) => void;
}) {
  const map = useMap();
  const clusterGroupRef = useRef<any>(null);
  const onNodeClickRef = useRef(onNodeClick);

  // Keep the callback ref updated
  useEffect(() => {
    onNodeClickRef.current = onNodeClick;
  }, [onNodeClick]);

  useEffect(() => {
    if (!map) return;

    const iconCreateFunction = (cluster: any) => {
      const children = cluster.getAllChildMarkers();
      return L.divIcon({
        html: renderToString(<ClusterMarker>{children}</ClusterMarker>),
        className: 'custom-cluster-icon',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });
    };

    const markers = (L as any).markerClusterGroup({
      iconCreateFunction,
      maxClusterRadius: 40,
    });

    nodes.forEach((node: NodePosition) => {
      const icon = L.divIcon({
        className: 'custom-node-marker-container',
        iconSize: [16, 32],
        iconAnchor: [8, 8],
        html: renderToString(<NodeMarker node={node} showNodeNames={showNodeNames} />),
      });
      const marker = L.marker([node.latitude, node.longitude], { icon });
      (marker as any).options.nodeData = node;
      marker.bindPopup(renderToString(<PopupContent node={node} />));
      
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
  }, [map, nodes, showNodeNames]);

  return null;
}

function ClusteredMarkers({ nodes, selectedNodeId, onNodeClick }: ClusteredMarkersProps) {
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
      />
    );
  }
}

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

export default function MapView() {
  const [nodePositions, setNodePositions] = useState<NodePosition[]>([]);
  const [bounds, setBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastResultCount, setLastResultCount] = useState<number>(0);
  const fetchController = useRef<AbortController | null>(null);
  const lastRequestedBounds = useRef<[[number, number], [number, number]] | null>(null);
  const configResult = useConfig();
  const config = configResult?.config;
  
  // Neighbor-related state
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  
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

  const fetchNodes = useCallback((bounds?: [[number, number], [number, number]]) => {
    if (fetchController.current) {
      fetchController.current.abort();
    }
    const controller = new AbortController();
    fetchController.current = controller;
    setLoading(true);
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
    if (params.length > 0) {
      url += `?${params.join("&")}`;
    }
    fetch(buildApiUrl(url), { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setNodePositions(data);
          setLastResultCount(data.length);
        }
        if (fetchController.current === controller) setLoading(false);
      })
      .catch((err) => {
        if (err.name !== "AbortError") setNodePositions([]);
        if (fetchController.current === controller) setLoading(false);
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
        const b = e.target.getBounds();
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
        const b = e.target.getBounds();
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
      fetchNodes(bounds);
      lastRequestedBounds.current = bounds;
    } else {
      // Don't fetch until bounds is set
      setNodePositions([]);
      lastRequestedBounds.current = null;
    }
    return () => {
      fetchController.current?.abort();
    };
  }, [bounds, config?.nodeTypes, config?.lastSeen, fetchNodes]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {/* Only Refresh Button Row */}
      <div style={{ position: "absolute", top: 16, right: 16, zIndex: 1000, display: 'flex', alignItems: 'center' }}>
        <RefreshButton
          onClick={() => bounds && fetchNodes(bounds)}
          loading={loading || !bounds}
          title="Refresh map nodes"
          ariaLabel="Refresh map nodes"
        />
      </div>
      <MapContainer
        center={[DEFAULT.lat, DEFAULT.lng]}
        zoom={DEFAULT.zoom}
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
          key={`clustering-${config?.clustering}-${config?.showNodeNames}`} 
          nodes={nodePositions} 
          selectedNodeId={selectedNodeId}
          onNodeClick={handleNodeClick}
        />
        <NeighborLines 
          selectedNodeId={selectedNodeId}
          neighbors={neighbors}
          nodes={nodePositions}
        />
      </MapContainer>
    </div>
  );
} 