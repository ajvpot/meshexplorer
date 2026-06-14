"use client";
import { useConfig } from "./ConfigContext";
import { useRegions, useRegionGroups } from "@/hooks/useRegions";

interface RegionSelectorProps {
  onRegionSelected?: () => void;
  className?: string;
}

const buttonClass =
  "w-full p-4 text-left border border-gray-200 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors";

export default function RegionSelector({ onRegionSelected, className = "" }: RegionSelectorProps) {
  const { config, setConfig } = useConfig();
  const { regions, isLoading } = useRegions();
  const { groups } = useRegionGroups();

  const handleRegionSelect = (code: string) => {
    setConfig({ ...config, selectedRegion: code });
    if (onRegionSelected) {
      onRegionSelected();
    }
  };

  return (
    <div className={`bg-white dark:bg-neutral-900 ${className}`}>
      <div className="text-center mb-6">
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-2">
          Select a Chat Region
        </h2>
        <p className="text-gray-600 dark:text-gray-300">Choose a region or group to filter chat messages</p>
      </div>

      {groups.length > 0 && (
        <>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
            Groups
          </div>
          <div className="grid gap-3 mb-5">
            {groups.map((g) => (
              <button key={g.code} onClick={() => handleRegionSelect(g.code)} className={buttonClass}>
                <div className="font-medium text-gray-800 dark:text-gray-100">{g.name}</div>
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{g.members.length} regions</div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2">
        Regions
      </div>
      <div className="grid gap-3">
        {isLoading ? (
          <div className="text-sm text-gray-500 dark:text-gray-400">Loading regions…</div>
        ) : (
          regions.map((r) => (
            <button key={r.name} onClick={() => handleRegionSelect(r.name)} className={buttonClass}>
              <div className="font-medium text-gray-800 dark:text-gray-100">{r.friendlyName}</div>
              {typeof r.nodeCount === "number" && (
                <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">{r.nodeCount} nodes</div>
              )}
            </button>
          ))
        )}
      </div>

      <div className="mt-6 text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          You can change this selection later in the Settings menu
        </p>
      </div>
    </div>
  );
}
