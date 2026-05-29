"use client";
import { useConfig } from "./ConfigContext";
import { getRegionFriendlyNames } from "@/lib/regions";

interface RegionSelectorProps {
  onRegionSelected?: () => void;
  className?: string;
}

export default function RegionSelector({ onRegionSelected, className = "" }: RegionSelectorProps) {
  const { config, setConfig } = useConfig();
  const regions = getRegionFriendlyNames();

  const handleRegionSelect = (regionName: string) => {
    setConfig({ ...config, selectedRegion: regionName });
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
        <p className="text-gray-600 dark:text-gray-300">Choose a region to filter chat messages</p>
      </div>

      <div className="grid gap-3">
        {regions.map(({ name, friendlyName }) => (
          <button
            key={name}
            onClick={() => handleRegionSelect(name)}
            className="w-full p-4 text-left border border-gray-200 dark:border-neutral-700 rounded-lg hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors"
          >
            <div className="font-medium text-gray-800 dark:text-gray-100">{friendlyName}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {name === "seattle" &&
                "Broker: mqtt.davekeogh.com, Base topics: meshcore, meshcore/salish"}
              {name === "portland" && "Broker: mqtt.davekeogh.com, Base topic: meshcore/pdx"}
              {name === "boston" && "Broker: mqtt.davekeogh.com, Base topic: meshcore/bos"}
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 text-center">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          You can change this selection later in the Settings menu
        </p>
      </div>
    </div>
  );
}
