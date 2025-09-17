"use client";
import React, { useState, useRef, useEffect } from 'react';
import { useMapLayerSettings, TILE_LAYERS, NODE_TYPE_OPTIONS, type MapLayerSettings } from '@/hooks/useMapLayerSettings';

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
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
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
