"use client";
import { MapContainer, TileLayer, useMapEvents, Marker, Popup, MapContainerProps, useMap } from "react-leaflet";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import 'leaflet/dist/leaflet.css';
import L from "leaflet";
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import { useConfig } from "./ConfigContext";
import RefreshButton from "@/components/RefreshButton";
import { renderNodeMarker, renderClusterMarker, renderPopupContent } from "./MapIcons";

const DEFAULT = {
  lat: 47.6062, // Seattle
  lng: -122.3321,
  zoom: 12,
};

type NodePosition = {
  node_id: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  last_seen?: string;
  type?: string;
  short_name?: string;
  name?: string | null;
};

type ClusteredMarkersProps = { nodes: NodePosition[] };
function ClusteredMarkers({ nodes }: ClusteredMarkersProps) {
  const map = useMap();
  const { config } = useConfig ? useConfig() : { config: undefined };
  useEffect(() => {
    if (!map) return;
    // Remove any previous layers
    map.eachLayer((layer: any) => {
      if (layer && layer._isClusterLayer) {
        map.removeLayer(layer);
      }
    });
    if (config?.clustering === false) {
      // Add markers individually
      const markerLayers: any[] = [];
      nodes.forEach((node: NodePosition) => {
        const icon = L.divIcon({
          className: 'custom-node-marker-container',
          iconSize: [16, 32],
          iconAnchor: [8, 8],
          html: renderNodeMarker(node, config?.showNodeNames !== false),
        });
        const marker = L.marker([node.latitude, node.longitude], { icon });
        (marker as any).options.nodeData = node;
        marker.bindPopup(renderPopupContent(node));
        marker.addTo(map);
        markerLayers.push(marker);
      });
      // Mark for cleanup
      markerLayers.forEach(layer => { layer._isClusterLayer = true; });
      return () => {
        markerLayers.forEach(layer => map.removeLayer(layer));
      };
    } else {
      // Clustered mode (existing logic)
      const iconCreateFunction = (cluster: any) => {
        const children = cluster.getAllChildMarkers();
        return L.divIcon({
          html: renderClusterMarker(children),
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
          html: renderNodeMarker(node, config?.showNodeNames !== false),
        });
        const marker = L.marker([node.latitude, node.longitude], { icon });
        (marker as any).options.nodeData = node;
        marker.bindPopup(renderPopupContent(node));
        markers.addLayer(marker);
      });
      markers._isClusterLayer = true;
      map.addLayer(markers);
      return () => {
        map.removeLayer(markers);
      };
    }
  }, [map, nodes, config?.clustering, config?.showNodeNames]);
  return null;
}

export default function MapView() {
  const [nodePositions, setNodePositions] = useState<NodePosition[]>([]);
  const [bounds, setBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastResultCount, setLastResultCount] = useState<number>(0);
  const fetchController = useRef<AbortController | null>(null);
  const lastRequestedBounds = useRef<[[number, number], [number, number]] | null>(null);
  const { config } = useConfig ? useConfig() : { config: undefined };

  type TileLayerKey = 'openstreetmap' | 'opentopomap' | 'esri';
  const tileLayerOptions: Record<TileLayerKey, { url: string; attribution: string; maxZoom: number; subdomains?: string[] }> = {
    openstreetmap: {
      url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution: 'Tiles &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> | Data from <a target="_blank" href="https://meshtastic.org/docs/software/integrations/mqtt/">Meshtastic</a>',
      maxZoom: 22,
    },
    opentopomap: {
      url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
      attribution: 'Tiles &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 17,
    },
    esri: {
      url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      attribution: 'Tiles &copy; <a href="https://developers.arcgis.com/documentation/mapping-apis-and-services/deployment/basemap-attribution/">Esri</a> | Data from <a target="_blank" href="https://meshtastic.org/docs/software/integrations/mqtt/">Meshtastic</a>',
      maxZoom: 21,
    },
  };
  const selectedTileLayer = tileLayerOptions[(config?.tileLayer as TileLayerKey) || 'openstreetmap'];

  function fetchNodes(bounds?: [[number, number], [number, number]]) {
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
    fetch(url, { signal: controller.signal })
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
  }

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
  }, [bounds, config?.nodeTypes, config?.lastSeen]);

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
      {/* Add keyframes for spin animation */}
      <style>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
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
        <ClusteredMarkers nodes={nodePositions} />
      </MapContainer>
    </div>
  );
} 