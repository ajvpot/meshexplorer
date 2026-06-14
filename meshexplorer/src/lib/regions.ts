import type { RegionGroup } from "@/lib/regionGroups";

// Legacy base topics that don't carry an IATA segment but belong to a region.
// davekeogh's bare `meshcore` and `meshcore/salish` are the Seattle catch-all.
export const REGION_ALIASES: Record<string, string> = {
  meshcore: "SEA",
  "meshcore/salish": "SEA",
};

// Friendly-name overrides for region codes. Unknown codes display as the bare IATA code.
export const REGION_FRIENDLY_NAMES: Record<string, string> = {
  SEA: "Seattle (PugetMesh, SalishMesh)",
  PDX: "Portland",
  BOS: "Boston",
};

// Backward-compat: old slug selectors map to their IATA codes.
export const LEGACY_SLUGS: Record<string, string> = {
  seattle: "SEA",
  portland: "PDX",
  boston: "BOS",
};

const IATA_RE = /^[a-z]{3}$/;
// Group codes are slugs (lowercase alnum + hyphen, length >= 2): never collide with an IATA
// region, and safe to embed as SQL literals (no quotes possible).
const GROUP_CODE_RE = /^[a-z0-9][a-z0-9-]+$/;

/**
 * Derives the IATA region code from a stored base topic (case-insensitive).
 * meshcore/SEA -> SEA, meshcore/pdx -> PDX, meshcore -> SEA, meshcore/salish -> SEA.
 * Returns null for unknown / non-3-letter segments (e.g. meshcore/test).
 */
export function regionFromTopic(topic?: string | null): string | null {
  if (!topic) return null;
  const t = topic.trim().toLowerCase();
  if (REGION_ALIASES[t]) return REGION_ALIASES[t];
  const seg = t.split("/")[1];
  return seg && IATA_RE.test(seg) ? seg.toUpperCase() : null;
}

/**
 * Normalizes an inbound region token (old slug, lower/upper IATA) to a canonical
 * uppercase IATA code, or null if it is not a recognizable single region.
 */
export function normalizeRegion(input?: string | null): string | null {
  const v = input?.trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  if (LEGACY_SLUGS[lower]) return LEGACY_SLUGS[lower];
  return IATA_RE.test(lower) ? v.toUpperCase() : null;
}

/**
 * If a selector is not an IATA region, treat it as a region-group code. Returns the sanitized
 * (lowercased slug) code or null. Used to resolve groups in SQL via the region_groups table.
 */
export function groupCodeOf(selector?: string | null): string | null {
  const v = selector?.trim().toLowerCase();
  if (!v || normalizeRegion(v)) return null; // empty, or a region (not a group)
  return GROUP_CODE_RE.test(v) ? v : null;
}

/** Display name for a region code (override map, else the bare code). */
export function friendlyName(code: string): string {
  return REGION_FRIENDLY_NAMES[code] ?? code;
}

/**
 * Display label for a selector. Group names come from `groups` (the DB-sourced list, e.g. from
 * useRegionGroups()); regions use the friendly-name map; otherwise the raw selector.
 */
export function selectorLabel(selector?: string | null, groups?: RegionGroup[]): string | null {
  if (!selector) return null;
  const g = groups?.find((x) => x.code.toLowerCase() === selector.trim().toLowerCase());
  if (g) return g.name;
  const code = normalizeRegion(selector);
  return code ? friendlyName(code) : selector;
}

/**
 * Canonical topic -> IATA region SQL expression — the single source of truth.
 *
 * Keep this byte-for-byte equal to the `region` ALIAS body (and the inline copies in the
 * neighbor / regions materialized views) in ingest/migrations/004_region_handle_and_groups.sql
 * — they are kept in sync by hand.
 *
 * Services both the topic column (regionSql('topic')) and origin_path_info array
 * elements (regionSql('x.5')).
 */
export function regionSql(t: string): string {
  return (
    `multiIf(lower(${t}) IN ('meshcore','meshcore/salish'), 'SEA', ` +
    `match(splitByChar('/', lower(${t}))[2], '^[a-z]{3}$'), upper(splitByChar('/', lower(${t}))[2]), ` +
    `'')`
  );
}

/**
 * ClickHouse condition over the `region` column for a selector (an IATA region OR a group code).
 * Groups are resolved in-DB against region_groups (no app-side membership). '' = no filter.
 */
export function generateRegionCondition(selector?: string, alias: string = ""): string {
  const col = alias ? `${alias}.region` : "region";
  const code = normalizeRegion(selector);
  if (code) return `${col} = '${code}'`;
  const g = groupCodeOf(selector);
  if (g) return `${col} IN (SELECT region_code FROM region_groups WHERE group_code = '${g}')`;
  return "";
}

/**
 * ClickHouse condition over the origin_path_info array (no `region` column). Region derived per
 * element via regionSql('x.5'); groups resolved in-DB. '' = no filter.
 */
export function generateRegionArrayCondition(selector?: string): string {
  const code = normalizeRegion(selector);
  if (code) return `arrayExists(x -> ${regionSql("x.5")} = '${code}', origin_path_info)`;
  const g = groupCodeOf(selector);
  if (g) {
    return (
      `hasAny(arrayMap(x -> ${regionSql("x.5")}, origin_path_info), ` +
      `(SELECT groupArray(region_code) FROM region_groups WHERE group_code = '${g}'))`
    );
  }
  return "";
}
