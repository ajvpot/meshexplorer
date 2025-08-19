"use client";
import React, { createContext, useContext, useState, useEffect, useRef, useLayoutEffect, ReactNode } from "react";
import { getChannelIdFromKey } from "../lib/meshcore";
import { getRegionFriendlyNames } from "../lib/regions";
import Modal from "./Modal";

// Config shape
type NodeType = "meshcore" | "meshtastic";
export type MeshcoreKey = {
  channelName: string;
  privateKey: string;
};
export type Config = {
  nodeTypes: NodeType[]; // which node types to show
  lastSeen: number | null; // seconds, or null for forever
  tileLayer: string; // add tileLayer selection
  clustering?: boolean; // add clustering toggle
  showNodeNames?: boolean; // add show node names toggle
  meshcoreKeys?: MeshcoreKey[]; // meshcore private keys
  showMeshcoreCoverageOverlay?: boolean; // meshcore overlay toggle
  selectedRegion?: string; // selected region for chat messages
};

const TILE_LAYERS = [
  { key: "openstreetmap", label: "OpenStreetMap" },
  { key: "opentopomap", label: "OpenTopoMap" },
  { key: "esri", label: "Esri World Imagery" },
];

const DEFAULT_CONFIG: Config = {
  nodeTypes: ["meshcore"],
  lastSeen: 604800, // 1 week by default
  tileLayer: "openstreetmap", // default
  clustering: true, // default to clustering enabled
  showNodeNames: true, // default to show node names
  meshcoreKeys: [], // default empty
  showMeshcoreCoverageOverlay: false, // meshcore overlay default
  selectedRegion: undefined, // no region selected by default
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

const PUBLIC_MESHCORE_KEY = {
  channelName: "Public",
  privateKey: "izOH6cXN6mrJ5e26oRXNcg==",
};

const ConfigContext = createContext<any>(null);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [open, setOpen] = useState(false);
  const [keyModalOpen, setKeyModalOpen] = useState(false);
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
      {open && <ConfigPopover config={config} setConfig={setConfig} onClose={closeConfig} anchorRef={configButtonRef} onOpenKeyModal={() => setKeyModalOpen(true)} />}
      {keyModalOpen && (
        <MeshcoreKeyModal
          config={config}
          setConfig={setConfig}
          onClose={() => {
            setConfig({
              ...config,
              meshcoreKeys: [...(config.meshcoreKeys?.filter(({channelName, privateKey}) => channelName !== "" || privateKey !== "") || [])],
            });
            setKeyModalOpen(false)
          }}
        />
      )}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  return useContext(ConfigContext);
}

function ConfigPopover({ config, setConfig, onClose, anchorRef, onOpenKeyModal }: { config: Config, setConfig: (c: Config) => void, onClose: () => void, anchorRef: React.RefObject<HTMLElement | null>, onOpenKeyModal: () => void }) {
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
      className="z-[2000] text-neutral-800 dark:text-neutral-200 bg-white dark:bg-neutral-900 rounded-lg shadow-lg p-6 min-w-[320px] max-w-[calc(100vw-16px)] max-h-[calc(100vh-16px)] overflow-auto border border-gray-200 dark:border-neutral-700 fixed top-16 right-4 flex flex-col"
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
      <div className="mb-2">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.showMeshcoreCoverageOverlay === true}
            onChange={e => setConfig({ ...config, showMeshcoreCoverageOverlay: e.target.checked })}
          />
          <span>Show meshcore coverage overlay</span>
        </label>
      </div>
      <div className="mb-2">
        <button
          className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 w-full"
          onClick={onOpenKeyModal}
        >
          Manage Meshcore Private Keys
        </button>
      </div>
      <div className="mb-2">
        <div className="font-medium mb-2">Chat Region</div>
        <select
          className="w-full p-2 border rounded"
          value={config.selectedRegion || ''}
          onChange={e => setConfig({ ...config, selectedRegion: e.target.value || undefined })}
        >
          <option value="">Select a region...</option>
          {getRegionFriendlyNames().map(({ name, friendlyName }) => (
            <option key={name} value={name}>{friendlyName}</option>
          ))}
        </select>
        <p className="text-xs text-gray-500 mt-1">
          Select a region to filter chat messages
        </p>
      </div>
    </div>
  );
}

// Add a helper to decode base64 or hex
function decodeKeyString(key: string): Buffer | null {
  if (!key) return null;
  // Try base64 first
  try {
    const b = Buffer.from(key, 'base64');
    if (b.length === 16) return b;
  } catch {}
  // Try hex (with or without 0x)
  let hex = key.trim();
  if (hex.startsWith('0x')) hex = hex.slice(2);
  if (/^[0-9a-fA-F]{32}$/.test(hex)) {
    try {
      const b = Buffer.from(hex, 'hex');
      if (b.length === 16) return b;
    } catch {}
  }
  return null;
}

function validateMeshcoreKey(key: string): string | null {
  if (!key) return null;
  const decoded = decodeKeyString(key);
  if (!decoded) {
    return 'Key must be 16 bytes, in base64 or hex (32 hex digits)';
  }
  return null;
}

function MeshcoreKeyModal({ config, setConfig, onClose }: { config: Config, setConfig: (c: Config) => void, onClose: () => void }) {
  return (
    <Modal isOpen={true} onClose={onClose} title="Meshcore Private Keys" maxWidth="90vw">
      <p className="mb-4 text-sm text-gray-600 dark:text-gray-300">
        These keys will be used to decrypt messages. <b>Your keys are never shared with the server</b>, so your messages remain secure.
      </p>
        <div className="flex flex-col gap-1 mb-2 p-2 border rounded bg-gray-100 dark:bg-neutral-700 opacity-80">
          <div className="flex items-center gap-2">
            <input
              className="flex-1 p-1 border rounded bg-gray-200 dark:bg-neutral-800 cursor-not-allowed"
              type="text"
              value={PUBLIC_MESHCORE_KEY.channelName}
              disabled
              readOnly
            />
            {/* Only show ID if valid */}
            {(() => {
              try {
                const id = getChannelIdFromKey(PUBLIC_MESHCORE_KEY.privateKey);
                return (
                  <span className="text-xs text-gray-500">ID: <span className="font-mono">{id}</span></span>
                );
              } catch {
                return null;
              }
            })()}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <input
              className="flex-1 p-1 border rounded font-mono bg-gray-200 dark:bg-neutral-800 cursor-not-allowed"
              type="text"
              value={PUBLIC_MESHCORE_KEY.privateKey}
              disabled
              readOnly
            />
            <button
              className="text-gray-400 px-2 py-1 cursor-not-allowed"
              disabled
              aria-label="Remove key"
            >
              Remove
            </button>
          </div>
        </div>
        {(config.meshcoreKeys || []).map((key, idx) => {
          const keyError = validateMeshcoreKey(key.privateKey);
          return (
            <div key={idx} className="flex flex-col gap-1 mb-2 p-2 border rounded bg-gray-50 dark:bg-neutral-800">
              <div className="flex items-center gap-2">
                <input
                  className="flex-1 p-1 border rounded"
                  type="text"
                  placeholder="Channel Name"
                  value={key.channelName}
                  onChange={e => {
                    const updated = [...(config.meshcoreKeys || [])];
                    updated[idx] = { ...updated[idx], channelName: e.target.value };
                    setConfig({ ...config, meshcoreKeys: updated });
                  }}
                />
                {/* Only show ID if valid */}
                {(() => {
                  try {
                    const id = getChannelIdFromKey(key.privateKey);
                    return (
                      <span className="text-xs text-gray-500">ID: <span className="font-mono">{id}</span></span>
                    );
                  } catch {
                    return null;
                  }
                })()}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <input
                  className={`flex-1 p-1 border rounded font-mono ${keyError ? 'border-red-500' : ''}`}
                  type="text"
                  placeholder="Base64 or Hex Private Key"
                  value={key.privateKey}
                  onChange={e => {
                    const updated = [...(config.meshcoreKeys || [])];
                    updated[idx] = { ...updated[idx], privateKey: e.target.value };
                    setConfig({ ...config, meshcoreKeys: updated });
                  }}
                />
                <button
                  className="text-red-500 hover:text-red-700 px-2 py-1"
                  onClick={() => {
                    const updated = [...(config.meshcoreKeys || [])];
                    updated.splice(idx, 1);
                    setConfig({ ...config, meshcoreKeys: updated });
                  }}
                  aria-label="Remove key"
                >
                  Remove
                </button>
              </div>
              {keyError && (
                <div className="text-xs text-red-500 mt-1">{keyError}</div>
              )}
            </div>
          );
        })}
        <button
          className="mt-2 px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
          onClick={() => {
            setConfig({
              ...config,
              meshcoreKeys: [...(config.meshcoreKeys || []), { channelName: '', privateKey: '' }],
            });
          }}
        >
          Add Meshcore Key
        </button>
    </Modal>
  );
} 