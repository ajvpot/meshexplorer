"use client";
import React, { useState, useRef, useEffect } from 'react';
import { useMapLayerSettings, TILE_LAYERS, NODE_TYPE_OPTIONS, type MapLayerSettings } from '@/hooks/useMapLayerSettings';
import { Square3Stack3DIcon } from '@heroicons/react/24/outline';

interface MapLayerSettingsProps {
  onSettingsChange?: (settings: MapLayerSettings) => void;
}

export default function MapLayerSettingsComponent({ onSettingsChange }: MapLayerSettingsProps) {
  const [settings, setSettings] = useMapLayerSettings();
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Notify parent of settings changes
  useEffect(() => {
    onSettingsChange?.(settings);
  }, [settings, onSettingsChange]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const updateSetting = <K extends keyof MapLayerSettings>(key: K, value: MapLayerSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 bg-white text-gray-700 hover:bg-gray-50 border border-gray-300 rounded-lg transition-colors"
        title="Map layer settings"
        aria-label="Map layer settings"
      >
        {/* Layers icon */}
        <Square3Stack3DIcon className="w-5 h-5" />
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute top-full right-0 mt-2 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg p-4 min-w-[250px] z-[1100]"
          style={{ boxSizing: 'border-box' }}
        >
          <h3 className="text-sm font-semibold mb-3 text-gray-800 dark:text-gray-200">Map Settings</h3>
          
          {/* Show nodes */}
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showNodes}
              onChange={(e) => updateSetting('showNodes', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Show nodes</span>
          </label>

          {/* Node types - indented sub-options */}
          {NODE_TYPE_OPTIONS.map(nodeType => (
            <label key={nodeType.key} className="flex items-center gap-2 mb-1 ml-6 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.nodeTypes.includes(nodeType.key as "meshcore" | "meshtastic")}
                onChange={(e) => {
                  const currentTypes = settings.nodeTypes;
                  if (e.target.checked) {
                    updateSetting('nodeTypes', [...currentTypes, nodeType.key as "meshcore" | "meshtastic"]);
                  } else {
                    updateSetting('nodeTypes', currentTypes.filter(t => t !== nodeType.key));
                  }
                }}
                disabled={!settings.showNodes}
                className="rounded"
              />
              <span className={`text-sm ${
                settings.showNodes 
                  ? 'text-gray-700 dark:text-gray-300' 
                  : 'text-gray-400 dark:text-gray-500'
              }`}>
                {nodeType.label}
              </span>
            </label>
          ))}

          {/* Show node names - indented sub-option */}
          <label className="flex items-center gap-2 mb-3 ml-6 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showNodeNames}
              onChange={(e) => updateSetting('showNodeNames', e.target.checked)}
              disabled={!settings.showNodes}
              className="rounded"
            />
            <span className={`text-sm ${
              settings.showNodes 
                ? 'text-gray-700 dark:text-gray-300' 
                : 'text-gray-400 dark:text-gray-500'
            }`}>
              Show node names
            </span>
          </label>

          {/* Enable marker clustering - indented sub-option */}
          <label className="flex items-center gap-2 mb-3 ml-6 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.enableClustering}
              onChange={(e) => updateSetting('enableClustering', e.target.checked)}
              disabled={!settings.showNodes}
              className="rounded"
            />
            <span className={`text-sm ${
              settings.showNodes 
                ? 'text-gray-700 dark:text-gray-300' 
                : 'text-gray-400 dark:text-gray-500'
            }`}>
              Enable marker clustering
            </span>
          </label>

          {/* Show all neighbors */}
          <label className="flex items-center gap-2 mb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showAllNeighbors}
              onChange={(e) => updateSetting('showAllNeighbors', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Show all neighbors</span>
          </label>

          {/* Path stroke width */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Path stroke width
            </label>
            <input
              type="range"
              min="1"
              max="8"
              step="1"
              value={settings.strokeWidth}
              onChange={(e) => updateSetting('strokeWidth', parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-neutral-600 rounded-lg appearance-none cursor-pointer slider"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>1px</span>
              <span className="font-medium">{settings.strokeWidth}px</span>
              <span>8px</span>
            </div>
            <p className="text-xs mt-1 text-gray-500 dark:text-gray-400">
              Controls the thickness of neighbor connection lines
            </p>
          </div>

          {/* Use colors - indented sub-option */}
          <label className="flex items-center gap-2 ml-6 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.useColors}
              onChange={(e) => updateSetting('useColors', e.target.checked)}
              disabled={!settings.showAllNeighbors}
              className="rounded"
            />
            <span className={`text-sm ${
              settings.showAllNeighbors 
                ? 'text-gray-700 dark:text-gray-300' 
                : 'text-gray-400 dark:text-gray-500'
            }`}>
              Use colors
            </span>
          </label>

          {/* Minimum packet count - indented sub-option */}
          <div className="ml-6 mb-3">
            <label className={`block text-sm ${
              settings.showAllNeighbors 
                ? 'text-gray-700 dark:text-gray-300' 
                : 'text-gray-400 dark:text-gray-500'
            } mb-1`}>
              Min packet count threshold
            </label>
            <input
              type="number"
              min="1"
              step="1"
              value={settings.minPacketCount}
              onChange={(e) => updateSetting('minPacketCount', Math.max(1, parseInt(e.target.value) || 1))}
              disabled={!settings.showAllNeighbors}
              className={`w-full p-2 border border-gray-300 dark:border-neutral-600 rounded text-sm ${
                settings.showAllNeighbors 
                  ? 'bg-white dark:bg-neutral-800 text-gray-700 dark:text-gray-300' 
                  : 'bg-gray-100 dark:bg-neutral-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
              }`}
            />
            <p className={`text-xs mt-1 ${
              settings.showAllNeighbors 
                ? 'text-gray-500 dark:text-gray-400' 
                : 'text-gray-400 dark:text-gray-500'
            }`}>
              Only show path neighbors with at least this many packets
            </p>
          </div>

          {/* Tile layer */}
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tile layer
            </label>
            <select
              value={settings.tileLayer}
              onChange={(e) => updateSetting('tileLayer', e.target.value)}
              className="w-full p-2 border border-gray-300 dark:border-neutral-600 rounded text-sm bg-white dark:bg-neutral-800 text-gray-700 dark:text-gray-300"
            >
              {TILE_LAYERS.map(layer => (
                <option key={layer.key} value={layer.key}>
                  {layer.label}
                </option>
              ))}
            </select>
          </div>

          {/* Show meshcore coverage overlay 
          <label className="flex items-center gap-2 mb-3 cursor-pointer">
            <input
              type="checkbox"
              checked={settings.showMeshcoreCoverageOverlay}
              onChange={(e) => updateSetting('showMeshcoreCoverageOverlay', e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Show meshcore coverage overlay</span>
          </label>
          */}
        </div>
      )}
    </div>
  );
}
