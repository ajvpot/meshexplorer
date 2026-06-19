import { generateRegionCondition, generateRegionArrayCondition } from "@/lib/regions";

/**
 * ClickHouse WHERE clause for filtering by a region selector (an IATA region or a group code).
 * Groups are resolved in-DB (region_groups); region values are validated literals, so no params.
 * @param region The selector to filter by (region code, group code, or legacy slug)
 * @param tableAlias Optional table alias for the query
 */
export function generateRegionWhereClause(region?: string, tableAlias: string = "") {
  return { whereClause: generateRegionCondition(region, tableAlias), params: {} };
}

/**
 * ClickHouse WHERE clause for filtering by a region selector using the origin_path_info array
 * (for views that expose it instead of a scalar region column).
 */
export function generateRegionWhereClauseFromArray(region?: string) {
  return { whereClause: generateRegionArrayCondition(region), params: {} };
}

/** Region condition string for streaming queries (column-based). '' when no/unknown selector. */
export function generateRegionConditionForStreaming(region?: string, tableAlias: string = ""): string {
  return generateRegionCondition(region, tableAlias);
}

/** Region condition string for streaming queries over origin_path_info. '' when no/unknown selector. */
export function generateRegionArrayConditionForStreaming(region?: string): string {
  return generateRegionArrayCondition(region);
}
