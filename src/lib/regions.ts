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

/**
 * Detects a region from broker and topic combination
 * @param broker The MQTT broker URL
 * @param topic The MQTT topic
 * @returns The region name or null if no match found
 */
export function detectRegionFromBrokerTopic(broker: string | null, topic: string | null): string | null {
  if (!broker || !topic) return null;
  
  // Check each region configuration
  for (const region of REGIONS) {
    // Check if this topic/broker combination matches the region
    if (broker === region.broker && region.topics.includes(topic)) {
      return region.name;
    }
  }
  
  return null;
}

/**
 * Combined region detection that tries MQTT topics first, then advert data
 * @param mqttTopics Array of MQTT topic information
 * @param advertBroker Broker from advert data
 * @param advertTopic Topic from advert data
 * @returns The detected region name or null if no region matches
 */
export function detectRegion(mqttTopics: Array<{ topic: string; broker: string }>, advertBroker: string | null, advertTopic: string | null): string | null {
  // First try MQTT topics (more reliable for uplinked nodes)
  for (const mqttTopic of mqttTopics) {
    const region = detectRegionFromBrokerTopic(mqttTopic.broker, mqttTopic.topic);
    if (region) return region;
  }
  
  // Fallback to advert data (works for non-uplinked nodes)
  return detectRegionFromBrokerTopic(advertBroker, advertTopic);
}

/**
 * Generates a broker/topic condition string for a region
 * @param regionName The region name
 * @param alias Optional table alias for the query
 * @returns The condition string or empty string if region not found
 */
export function generateRegionCondition(regionName: string, alias: string = ''): string {
  const regionConfig = getRegionConfig(regionName);
  if (!regionConfig) return '';
  
  const prefix = alias ? `${alias}.` : '';
  const topicConditions = regionConfig.topics.map(topic => `${prefix}topic = '${topic}'`);
  const topicClause = topicConditions.length > 1 ? `(${topicConditions.join(' OR ')})` : topicConditions[0];
  
  return `${prefix}broker = '${regionConfig.broker}' AND ${topicClause}`;
}

/**
 * Generates an array condition string for a region (for origin_path_info fields)
 * @param regionName The region name
 * @returns The array condition string or empty string if region not found
 */
export function generateRegionArrayCondition(regionName: string): string {
  const regionConfig = getRegionConfig(regionName);
  if (!regionConfig) return '';
  
  const topicConditions = regionConfig.topics.map(topic => `x.5 = '${topic}'`);
  const topicClause = topicConditions.length > 1 ? `(${topicConditions.join(' OR ')})` : topicConditions[0];
  
  return `arrayExists(x -> x.4 = '${regionConfig.broker}' AND ${topicClause}, origin_path_info)`;
}

