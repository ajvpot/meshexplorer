"use client";
import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Polyline, Popup, useMap } from "react-leaflet";
import moment from "moment";
import 'leaflet/dist/leaflet.css';
import L from "leaflet";
import { type LocationHistory } from "@/hooks/useNodeData";

interface LocationHistoryMapProps {
  locations: LocationHistory[];
}

// Fit the map to all location points on mount / when the points change.
function FitBounds({ coords }: { coords: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length === 0) return;
    if (coords.length === 1) {
      map.setView(coords[0], 14);
      return;
    }
    map.fitBounds(L.latLngBounds(coords), { padding: [24, 24] });
  }, [map, coords]);
  return null;
}

export default function LocationHistoryMap({ locations }: LocationHistoryMapProps) {
  // locations come newest-first; coords reversed to chronological for the track line.
  const coords = locations.map((l) => [l.latitude, l.longitude] as [number, number]);
  const trackCoords = [...coords].reverse();

  return (
    <MapContainer
      center={coords[0] ?? [0, 0]}
      zoom={13}
      scrollWheelZoom={false}
      style={{ height: '400px', width: '100%' }}
      className="rounded-b-lg z-0"
    >
      <TileLayer
        attribution='Tiles &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {trackCoords.length > 1 && (
        <Polyline
          positions={trackCoords}
          pathOptions={{ color: '#3b82f6', weight: 2, opacity: 0.4 }}
        />
      )}
      {locations.map((location, index) => {
        const isLatest = index === 0;
        return (
          <CircleMarker
            key={`${location.latitude},${location.longitude},${location.mesh_timestamp}`}
            center={[location.latitude, location.longitude]}
            radius={isLatest ? 8 : 5}
            pathOptions={{
              color: isLatest ? '#2563eb' : '#6b7280',
              fillColor: isLatest ? '#3b82f6' : '#9ca3af',
              fillOpacity: isLatest ? 0.9 : 0.5,
              weight: isLatest ? 2 : 1,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <div className="font-medium">
                  {moment.utc(location.mesh_timestamp).format('YYYY-MM-DD HH:mm:ss')} UTC
                </div>
                <div className="font-mono">
                  {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
                </div>
                {isLatest && <div className="text-blue-600">Most recent</div>}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
      <FitBounds coords={coords} />
    </MapContainer>
  );
}
