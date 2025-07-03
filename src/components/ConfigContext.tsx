"use client";
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from "react";

interface Config {
  theme: "light" | "dark";
  // Add more config options as needed
}

interface ConfigContextType {
  config: Config;
  setConfig: (config: Config) => void;
  openConfig: () => void;
}

const defaultConfig: Config = {
  theme: "light",
};

const ConfigContext = createContext<ConfigContextType | undefined>(undefined);

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<Config>(defaultConfig);
  const [showPopover, setShowPopover] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("globalConfig");
    if (stored) setConfigState(JSON.parse(stored));
  }, []);

  useEffect(() => {
    localStorage.setItem("globalConfig", JSON.stringify(config));
  }, [config]);

  // Close popover on outside click or Escape
  useEffect(() => {
    if (!showPopover) return;
    function onClick(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowPopover(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setShowPopover(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [showPopover]);

  const setConfig = (newConfig: Config) => setConfigState(newConfig);
  const openConfig = () => setShowPopover(v => !v);

  // Provide ref to button for Header
  const contextValue = React.useMemo(() => ({ config, setConfig, openConfig }), [config]);

  return (
    <ConfigContext.Provider value={contextValue}>
      {/* Clone header to inject ref */}
      {React.Children.map(children, child => {
        if (
          React.isValidElement(child) &&
          child.type &&
          (child as any).type.name === "Header"
        ) {
          return React.cloneElement(child, { configButtonRef: buttonRef });
        }
        return child;
      })}
      {/* Popover */}
      {showPopover && (
        <div
          ref={popoverRef}
          style={{
            position: "absolute",
            top: buttonRef.current?.getBoundingClientRect().bottom ?? 60,
            left: buttonRef.current?.getBoundingClientRect().right ?? window.innerWidth - 300,
            zIndex: 1000,
          }}
          className="fixed bg-white dark:bg-neutral-900 p-6 rounded shadow-lg min-w-[300px] border border-neutral-200 dark:border-neutral-700"
        >
          <h2 className="text-lg font-bold mb-4">Configuration</h2>
          <label className="block mb-2">
            Theme:
            <select
              value={config.theme}
              onChange={e => setConfig({ ...config, theme: e.target.value as Config["theme"] })}
              className="ml-2 border rounded px-2 py-1"
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      )}
    </ConfigContext.Provider>
  );
}

export function useConfig() {
  const ctx = useContext(ConfigContext);
  if (!ctx) throw new Error("useConfig must be used within a ConfigProvider");
  return ctx;
} 