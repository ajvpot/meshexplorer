"use client";
import { MapContainer, TileLayer, useMapEvents, Marker, Popup, MapContainerProps, useMap } from "react-leaflet";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import 'leaflet/dist/leaflet.css';
import L from "leaflet";
import 'leaflet.markercluster/dist/leaflet.markercluster.js';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';

const DEFAULT = {
  lat: 47.6062, // Seattle
  lng: -122.3321,
  zoom: 12,
};

type NodePosition = {
  from_node_id: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  last_seen?: string;
  type?: string;
  short_name?: string;
};

type ClusteredMarkersProps = { nodes: NodePosition[] };
function ClusteredMarkers({ nodes }: ClusteredMarkersProps) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const markers = (L as any).markerClusterGroup();
    nodes.forEach((node: NodePosition) => {
      const markerClass =
        node.type === "meshtastic"
          ? "custom-node-marker custom-node-marker--green"
          : node.type === "meshcore"
          ? "custom-node-marker custom-node-marker--blue custom-node-marker--top"
          : "custom-node-marker";
      const label = node.short_name ? `<div class='custom-node-label'>${node.short_name}</div>` : '';
      const icon = L.divIcon({
        className: 'custom-node-marker-container',
        iconSize: [16, 32],
        iconAnchor: [8, 8],
        html: `${label}<div class='${markerClass}'></div>`,
      });
      const marker = L.marker([node.latitude, node.longitude], { icon });
      let popupHtml = `<div><div><b>ID:</b> ${node.from_node_id}</div><div><b>Lat:</b> ${node.latitude}</div><div><b>Lng:</b> ${node.longitude}</div>`;
      if (node.altitude !== undefined) popupHtml += `<div><b>Alt:</b> ${node.altitude}</div>`;
      if (node.last_seen) popupHtml += `<div><b>Last seen:</b> ${node.last_seen}</div>`;
      if (node.type) popupHtml += `<div><b>Type:</b> ${node.type}</div>`;
      popupHtml += `</div>`;
      marker.bindPopup(popupHtml);
      markers.addLayer(marker);
    });
    map.addLayer(markers);
    return () => {
      map.removeLayer(markers);
    };
  }, [map, nodes]);
  return null;
}

export default function MapView() {
  const [nodePositions, setNodePositions] = useState<NodePosition[]>([]);
  const [bounds, setBounds] = useState<[[number, number], [number, number]] | null>(null);
  const [loading, setLoading] = useState(false);
  const fetchController = useRef<AbortController | null>(null);
  const lastRequestedBounds = useRef<[[number, number], [number, number]] | null>(null);

  function fetchNodes(bounds?: [[number, number], [number, number]]) {
    if (fetchController.current) {
      fetchController.current.abort();
    }
    const controller = new AbortController();
    fetchController.current = controller;
    setLoading(true);
    let url = "/api/node-positions";
    if (bounds) {
      const [[minLat, minLng], [maxLat, maxLng]] = bounds;
      url += `?minLat=${minLat}&maxLat=${maxLat}&minLng=${minLng}&maxLng=${maxLng}`;
    }
    fetch(url, { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) setNodePositions(data);
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
        if (!lastRequestedBounds.current || !isBoundsInside(newBounds, lastRequestedBounds.current)) {
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
        if (!lastRequestedBounds.current || !isBoundsInside(newBounds, lastRequestedBounds.current)) {
          setBounds(newBounds);
        }
      },
    });
    return null;
  }

  useEffect(() => {
    fetchController.current?.abort(); // abort any in-flight request on effect cleanup
    if (bounds) {
      fetchNodes(bounds);
      lastRequestedBounds.current = bounds;
    } else {
      fetchNodes();
      lastRequestedBounds.current = null;
    }
    return () => {
      fetchController.current?.abort();
    };
  }, [bounds]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      {loading && (
        <div style={{ position: "absolute", top: 16, right: 16, zIndex: 1000 }}>
          <div className="map-spinner" />
        </div>
      )}
      <MapContainer
        center={[DEFAULT.lat, DEFAULT.lng]}
        zoom={DEFAULT.zoom}
        style={{ width: "100%", height: "100%", zIndex: 1 }}
        className="bg-gray-200"
      >
        <MapEventCatcher />
        <TileLayer
          attribution='&copy; OpenStreetMap contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClusteredMarkers nodes={nodePositions} />
      </MapContainer>
    </div>
  );
} 