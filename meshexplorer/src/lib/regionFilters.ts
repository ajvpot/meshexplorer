import { getRegionConfig, generateRegionCondition, generateRegionArrayCondition, detectRegionFromBrokerTopic, detectRegion } from "@/lib/regions";

// Re-export region detection functions for backward compatibility
export { detectRegionFromBrokerTopic, detectRegion };

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

  const regionCondition = generateRegionCondition(region, tableAlias);
  return {
    whereClause: regionCondition,
    params: {}
  };
}

/**
 * Generates a ClickHouse WHERE clause for filtering by region using origin_path_info
 * This is for views that have the origin_path_info field
 * @param region The region name to filter by
 * @returns Object containing the where clause and parameters
 */
export function generateRegionWhereClauseFromArray(region?: string) {
  if (!region) {
    return { whereClause: '', params: {} };
  }

  const arrayCondition = generateRegionArrayCondition(region);
  return {
    whereClause: arrayCondition,
    params: {}
  };
}

/**
 * Generates a simple region condition string for streaming queries
 * @param region The region name to filter by
 * @returns The condition string or empty string if no region specified
 */
export function generateRegionConditionForStreaming(region?: string): string {
  if (!region) return '';
  return generateRegionCondition(region);
}

/**
 * Generates a region condition string for streaming queries using origin_path_info
 * @param region The region name to filter by
 * @returns The condition string or empty string if no region specified
 */
export function generateRegionArrayConditionForStreaming(region?: string): string {
  if (!region) return '';
  return generateRegionArrayCondition(region);
}
