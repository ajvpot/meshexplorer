"use client";
import { useLocalStorage } from './useLocalStorage';

type NodeType = "meshcore" | "meshtastic";

export interface MapLayerSettings {
  showNodes: boolean;
  showNodeNames: boolean;
  enableClustering: boolean;
  tileLayer: string;
  showAllNeighbors: boolean;
  useColors: boolean;
  nodeTypes: NodeType[];
  showMeshcoreCoverageOverlay: boolean;
}

const DEFAULT_MAP_LAYER_SETTINGS: MapLayerSettings = {
  showNodes: true,
  showNodeNames: true,
  enableClustering: true,
  tileLayer: "openstreetmap",
  showAllNeighbors: false,
  useColors: true,
  nodeTypes: ["meshcore"],
  showMeshcoreCoverageOverlay: false,
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
  { key: "meshtastic", label: "Meshtastic" },
];
