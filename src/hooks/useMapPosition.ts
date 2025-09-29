"use client";

import { useLocalStorage } from './useLocalStorage';

export interface MapPosition {
  lat: number;
  lng: number;
  zoom: number;
}

const DEFAULT_MAP_POSITION: MapPosition = {
  lat: 39.8283, // Center of the United States
  lng: -98.5795, // Center of the United States
  zoom: 4, // Zoom level to show the entire US
};

export function useMapPosition() {
  return useLocalStorage<MapPosition>("mapPosition", DEFAULT_MAP_POSITION);
}
