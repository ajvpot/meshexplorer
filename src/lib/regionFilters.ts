import { getRegionConfig } from "@/lib/regions";

/**
 * Generates a ClickHouse WHERE clause for filtering by region using broker and topic fields
 * @param region The region name to filter by
 * @param tableAlias Optional table alias for the query
 * @returns Object containing the where clause and parameters
 */
export function generateRegionWhereClause(region?: string, tableAlias: string = '') {
  if (!region) {
    return { whereClause: '', params: {} };
  }

  const regionConfig = getRegionConfig(region);
  if (!regionConfig) {
    return { whereClause: '', params: {} };
  }

  const alias = tableAlias ? `${tableAlias}.` : '';
  
  if (region === 'seattle') {
    return {
      whereClause: `${alias}broker = 'tcp://mqtt.davekeogh.com:1883' AND (${alias}topic = 'meshcore' OR ${alias}topic = 'meshcore/salish')`,
      params: {}
    };
  } else if (region === 'portland') {
    return {
      whereClause: `${alias}broker = 'tcp://mqtt.davekeogh.com:1883' AND ${alias}topic = 'meshcore/pdx'`,
      params: {}
    };
  } else if (region === 'boston') {
    return {
      whereClause: `${alias}broker = 'tcp://mqtt.davekeogh.com:1883' AND ${alias}topic = 'meshcore/bos'`,
      params: {}
    };
  }

  return { whereClause: '', params: {} };
}

/**
 * Generates a ClickHouse WHERE clause for filtering by region using topic_broker_array
 * This is for views that already have the topic_broker_array field
 * @param region The region name to filter by
 * @returns Object containing the where clause and parameters
 */
export function generateRegionWhereClauseFromArray(region?: string) {
  if (!region) {
    return { whereClause: '', params: {} };
  }

  const regionConfig = getRegionConfig(region);
  if (!regionConfig) {
    return { whereClause: '', params: {} };
  }

  if (region === 'seattle') {
    return {
      whereClause: "arrayExists(x -> x.1 = 'tcp://mqtt.davekeogh.com:1883' AND (x.2 = 'meshcore' OR x.2 = 'meshcore/salish'), topic_broker_array)",
      params: {}
    };
  } else if (region === 'portland') {
    return {
      whereClause: "arrayExists(x -> x.1 = 'tcp://mqtt.davekeogh.com:1883' AND x.2 = 'meshcore/pdx', topic_broker_array)",
      params: {}
    };
  } else if (region === 'boston') {
    return {
      whereClause: "arrayExists(x -> x.1 = 'tcp://mqtt.davekeogh.com:1883' AND x.2 = 'meshcore/bos', topic_broker_array)",
      params: {}
    };
  }

  return { whereClause: '', params: {} };
}
