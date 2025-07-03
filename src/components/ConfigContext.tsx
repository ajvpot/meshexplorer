"use client";
import React, { createContext, useContext, useState, useEffect, useRef, useLayoutEffect, ReactNode } from "react";

// Config shape
type NodeType = "meshcore" | "meshtastic";
export type Config = {
  nodeTypes: NodeType[]; // which node types to show
  lastSeen: number | null; // seconds, or null for forever
  tileLayer: string; // add tileLayer selection
  clustering?: boolean; // add clustering toggle
  showNodeNames?: boolean; // add show node names toggle
};

const TILE_LAYERS = [
  { key: "openstreetmap", label: "OpenStreetMap" },
  { key: "opentopomap", label: "OpenTopoMap" },
  { key: "esri", label: "Esri World Imagery" },
];

const DEFAULT_CONFIG: Config = {
  nodeTypes: ["meshcore", "meshtastic"],
  lastSeen: null, // forever by default
  tileLayer: "openstreetmap", // default
  clustering: true, // default to clustering enabled
  showNodeNames: true, // default to show node names
};

const LAST_SEEN_OPTIONS = [
  { value: 1800, label: "30m" },
  { value: 3600, label: "1h" },
  { value: 7200, label: "2h" },
  { value: 14400, label: "4h" },
  { value: 28800, label: "8h" },
  { value: 86400, label: "24h" },
  { value: 604800, label: "1w" },
  { value: null, label: "Forever (all time)" },
];

const ConfigContext = createContext<any>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [open, setOpen] = useState(false);
  const configButtonRef = useRef<HTMLElement | null>(null);
  const firstRender = useRef(true);

  // Load from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("meshExplorerConfig");
    if (stored) {
      try {
        setConfig({ ...DEFAULT_CONFIG, ...JSON.parse(stored) });
      } catch {}
    }
  }, []);

  // Save to localStorage
  useEffect(() => {
    if (!firstRender.current) {
      localStorage.setItem("meshExplorerConfig", JSON.stringify(config));
    } else {
      firstRender.current = false;
    }
  }, [config]);

  // Expose openConfig for header button
  const openConfig = () => setOpen(true);
  const closeConfig = () => setOpen(false);

  return (
    <ConfigContext.Provider value={{ config, setConfig, openConfig, configButtonRef }}>
      {children}
      {open && <ConfigPopover config={config} setConfig={setConfig} onClose={closeConfig} anchorRef={configButtonRef} />}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  return useContext(ConfigContext);
}

function ConfigPopover({ config, setConfig, onClose, anchorRef }: { config: Config, setConfig: (c: Config) => void, onClose: () => void, anchorRef: React.RefObject<HTMLElement | null> }) {
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [onClose, anchorRef]);

  // Use fixed positioning and CSS to keep the popover on screen
  return (
    <div
      ref={popoverRef}
      className="z-[2000] bg-white dark:bg-neutral-900 rounded-lg shadow-lg p-6 min-w-[320px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-auto border border-gray-200 dark:border-neutral-700 fixed top-16 right-4 flex flex-col"
      style={{ boxSizing: 'border-box' }}
    >
      <button
        className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        onClick={onClose}
        aria-label="Close config"
      >
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
      <h2 className="text-lg font-semibold mb-4">Map Filters</h2>
      <div className="mb-4">
        <div className="font-medium mb-2">Node Types</div>
        <label className="flex items-center gap-2 mb-1">
          <input
            type="checkbox"
            checked={config.nodeTypes.includes("meshcore")}
            onChange={e => {
              setConfig({
                ...config,
                nodeTypes: e.target.checked
                  ? Array.from(new Set([...config.nodeTypes, "meshcore"]))
                  : config.nodeTypes.filter(t => t !== "meshcore"),
              });
            }}
          />
          <span className="text-blue-700 dark:text-blue-400">Meshcore</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.nodeTypes.includes("meshtastic")}
            onChange={e => {
              setConfig({
                ...config,
                nodeTypes: e.target.checked
                  ? Array.from(new Set([...config.nodeTypes, "meshtastic"]))
                  : config.nodeTypes.filter(t => t !== "meshtastic"),
              });
            }}
          />
          <span className="text-green-600 dark:text-green-400">Meshtastic</span>
        </label>
      </div>
      <div className="mb-2">
        <div className="font-medium mb-2">Last Seen</div>
        <select
          className="w-full p-2 border rounded"
          value={config.lastSeen === null ? '' : config.lastSeen}
          onChange={e => {
            setConfig({ ...config, lastSeen: e.target.value === '' ? null : Number(e.target.value) });
          }}
        >
          {LAST_SEEN_OPTIONS.map(opt => (
            <option key={String(opt.value)} value={opt.value === null ? '' : opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mb-2">
        <div className="font-medium mb-2">Tile Layer</div>
        <select
          className="w-full p-2 border rounded"
          value={config.tileLayer}
          onChange={e => setConfig({ ...config, tileLayer: e.target.value })}
        >
          {TILE_LAYERS.map(opt => (
            <option key={opt.key} value={opt.key}>{opt.label}</option>
          ))}
        </select>
      </div>
      <div className="mb-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.clustering !== false}
            onChange={e => setConfig({ ...config, clustering: e.target.checked })}
          />
          <span>Enable marker clustering</span>
        </label>
      </div>
      <div className="mb-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.showNodeNames !== false}
            onChange={e => setConfig({ ...config, showNodeNames: e.target.checked })}
          />
          <span>Show node names</span>
        </label>
      </div>
    </div>
  );
} 