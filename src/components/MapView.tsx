"use client";
import { MapContainer, TileLayer, useMapEvents, Marker, Popup } from "react-leaflet";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";

const DEFAULT = {
  lat: 47.6062, // Seattle
  lng: -122.3321,
  zoom: 12,
};

function parseQuery(searchParams: ReturnType<typeof useSearchParams>) {
  const lat = parseFloat(searchParams.get("lat") || "");
  const lng = parseFloat(searchParams.get("lng") || "");
  const zoom = parseInt(searchParams.get("zoom") || "");
  return {
    lat: isNaN(lat) ? DEFAULT.lat : lat,
    lng: isNaN(lng) ? DEFAULT.lng : lng,
    zoom: isNaN(zoom) ? DEFAULT.zoom : zoom,
  };
}

function MapSync() {
  const map = useMapEvents({});
  const router = useRouter();
  const searchParams = useSearchParams();
  const last = useRef({ lat: 0, lng: 0, zoom: 0 });

  useEffect(() => {
    const onMove = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      if (
        Math.abs(center.lat - last.current.lat) > 1e-6 ||
        Math.abs(center.lng - last.current.lng) > 1e-6 ||
        zoom !== last.current.zoom
      ) {
        last.current = { lat: center.lat, lng: center.lng, zoom };
        const params = new URLSearchParams(searchParams.toString());
        params.set("lat", center.lat.toFixed(5));
        params.set("lng", center.lng.toFixed(5));
        params.set("zoom", String(zoom));
        router.replace("?" + params.toString(), { scroll: false });
      }
    };
    map.on("moveend", onMove);
    map.on("zoomend", onMove);
    return () => {
      map.off("moveend", onMove);
      map.off("zoomend", onMove);
    };
  }, [map, router, searchParams]);
  return null;
}

type NodePosition = {
  from_node_id: string;
  latitude: number;
  longitude: number;
  altitude?: number;
  last_seen?: string;
};

interface MapViewProps {
  nodePositions?: NodePosition[];
}

export default function MapView({ nodePositions = [] }: MapViewProps) {
  const searchParams = useSearchParams();
  const { lat, lng, zoom } = useMemo(() => parseQuery(searchParams), [searchParams]);
  return (
    <MapContainer
      center={[lat, lng]}
      zoom={zoom}
      style={{ width: "100%", height: "100%", zIndex: 1 }}
      className="bg-gray-200"
    >
      <TileLayer
        attribution='&copy; OpenStreetMap contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {nodePositions.map((node) => (
        <Marker key={node.from_node_id} position={[node.latitude, node.longitude]}>
          <Popup>
            <div>
              <div><b>ID:</b> {node.from_node_id}</div>
              <div><b>Lat:</b> {node.latitude}</div>
              <div><b>Lng:</b> {node.longitude}</div>
              {node.altitude !== undefined && <div><b>Alt:</b> {node.altitude}</div>}
              {node.last_seen && <div><b>Last seen:</b> {node.last_seen}</div>}
            </div>
          </Popup>
        </Marker>
      ))}
      <MapSync />
    </MapContainer>
  );
} 