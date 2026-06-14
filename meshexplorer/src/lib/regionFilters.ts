import {
  generateRegionCondition,
  generateRegionArrayCondition,
  resolveSelector,
} from "@/lib/regions";

/**
 * ClickHouse WHERE clause for filtering by a region selector (an IATA region or a group code)
 * using the `region` column. The selector is resolved to canonical IATA codes internally.
 * @param region The selector to filter by (region code, group code, or legacy slug)
 * @param tableAlias Optional table alias for the query
 */
export function generateRegionWhereClause(region?: string, tableAlias: string = "") {
  return {
    whereClause: generateRegionCondition(resolveSelector(region), tableAlias),
    params: {},
  };
}

/**
 * ClickHouse WHERE clause for filtering by a region selector using the origin_path_info array
 * (for views that expose it instead of a scalar region column).
 */
export function generateRegionWhereClauseFromArray(region?: string) {
  return {
    whereClause: generateRegionArrayCondition(resolveSelector(region)),
    params: {},
  };
}

/** Region condition string for streaming queries (column-based). '' when no/unknown selector. */
export function generateRegionConditionForStreaming(region?: string): string {
  return generateRegionCondition(resolveSelector(region));
}

/** Region condition string for streaming queries over origin_path_info. '' when no/unknown selector. */
export function generateRegionArrayConditionForStreaming(region?: string): string {
  return generateRegionArrayCondition(resolveSelector(region));
}
