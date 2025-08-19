export interface RegionConfig {
  name: string;
  friendlyName: string;
  broker: string;
  topics: string[];
}

export const REGIONS: RegionConfig[] = [
  {
    name: "seattle",
    friendlyName: "Seattle (PugetMesh, SalishMesh)",
    broker: "tcp://mqtt.davekeogh.com:1883",
    topics: ["meshcore", "meshcore/salish"]
  },
  {
    name: "portland",
    friendlyName: "Portland",
    broker: "tcp://mqtt.davekeogh.com:1883",
    topics: ["meshcore/pdx"]
  },
  {
    name: "boston",
    friendlyName: "Boston",
    broker: "tcp://mqtt.davekeogh.com:1883",
    topics: ["meshcore/bos"]
  }
];

export function getRegionConfig(regionName: string): RegionConfig | undefined {
  return REGIONS.find(region => region.name === regionName);
}

export function getRegionNames(): string[] {
  return REGIONS.map(region => region.name);
}

export function getRegionFriendlyNames(): { name: string; friendlyName: string }[] {
  return REGIONS.map(region => ({ name: region.name, friendlyName: region.friendlyName }));
}

