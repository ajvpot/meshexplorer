import { useConfig } from "@/components/ConfigContext";
import { useRegionContext } from "@/contexts/RegionContext";

/**
 * Custom hook that combines ConfigContext with RegionContext
 * When RegionContext is available, it overrides the selectedRegion from ConfigContext
 */
export function useConfigWithRegion() {
  const config = useConfig();
  const regionContext = useRegionContext();
  
  // If region context is available, override the selectedRegion
  if (regionContext) {
    return {
      ...config,
      config: {
        ...config.config,
        selectedRegion: regionContext.region
      }
    };
  }
  
  // Otherwise, return the normal config
  return config;
}
