"use client";
import { useLocalStorage } from './useLocalStorage';

type NodeType = "meshcore";

export interface MapLayerSettings {
  showNodes: boolean;
  showNodeNames: boolean;
  enableClustering: boolean;
  tileLayer: string;
  showAllNeighbors: boolean;
  useColors: boolean;
  // Minimum edge confidence to display. Subsumes the old "only MQTT neighbors" toggle: at 1.0 only
  // literal MQTT-direct edges show; lower values progressively include anchored and path-inferred edges.
  minConfidence: number;
  nodeTypes: NodeType[];
  showMeshcoreCoverageOverlay: boolean;
  minPacketCount: number;
  strokeWidth: number;
}

const DEFAULT_MAP_LAYER_SETTINGS: MapLayerSettings = {
  showNodes: true,
  showNodeNames: true,
  enableClustering: true,
  tileLayer: "openstreetmap",
  showAllNeighbors: false,
  useColors: true,
  minConfidence: 0.5,
  nodeTypes: ["meshcore"],
  showMeshcoreCoverageOverlay: false,
  minPacketCount: 1,
  strokeWidth: 2,
};

export function useMapLayerSettings() {
  return useLocalStorage<MapLayerSettings>("mapLayerSettings", DEFAULT_MAP_LAYER_SETTINGS);
}

export const TILE_LAYERS = [
  { key: "openstreetmap", label: "OpenStreetMap" },
  { key: "opentopomap", label: "OpenTopoMap" },
  { key: "esri", label: "Esri World Imagery" },
];

export const NODE_TYPE_OPTIONS = [
  { key: "meshcore", label: "Meshcore" },
];

// Neighbor confidence tiers, mapped to the minimum edge confidence emitted by
// meshcore_all_neighbor_edges (direct=1.0, anchored/3-byte≈0.8, 2-byte≈0.6, 1-byte≈0.4).
export const NEIGHBOR_CONFIDENCE_OPTIONS = [
  { value: 1.0, label: "MQTT direct only" },
  { value: 0.7, label: "High (anchored + extended hash)" },
  { value: 0.5, label: "Standard" },
  { value: 0, label: "All (include weak 1-byte)" },
];
