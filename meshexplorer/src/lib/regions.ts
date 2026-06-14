import { getRegionGroup, groupNameOf } from "@/lib/regionGroups";

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
const IATA_LITERAL = /^[A-Z]{3}$/;

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

/** Display name for a region code (override map, else the bare code). */
export function friendlyName(code: string): string {
  return REGION_FRIENDLY_NAMES[code] ?? code;
}

/**
 * Canonical topic -> IATA region SQL expression — the single source of truth.
 *
 * REGION-DERIVATION-CANONICAL: kept byte-for-byte equal to the `region` ALIAS body in
 * ingest/migrations/004_region_handle_and_groups.sql. The parity script
 * (scripts/region-parity.ts) compares regionSql('topic') against the migration's
 * sentinel-wrapped expression and fails CI on drift.
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
 * Resolves a selector (an IATA region OR a group code) to a list of canonical IATA codes.
 * Group-first (so a group code always means the group); unknown/empty -> [] (caller = no filter).
 */
export function resolveSelector(input?: string | null): string[] {
  const group = getRegionGroup(input);
  if (group) {
    const seen = new Set<string>();
    for (const m of group.members) {
      const code = normalizeRegion(m);
      if (code) seen.add(code);
    }
    return [...seen];
  }
  const code = normalizeRegion(input);
  return code ? [code] : [];
}

/** Display label for a selector: group name, else friendly region name, else the raw input. */
export function selectorLabel(input?: string | null): string | null {
  if (!input) return null;
  const groupName = groupNameOf(input);
  if (groupName) return groupName;
  const code = normalizeRegion(input);
  return code ? friendlyName(code) : input;
}

// Defensive quoting: only emit codes that are exactly 3 uppercase letters (injection-safe literals).
function quoteCodes(codes: string[]): string {
  return codes
    .filter((c) => IATA_LITERAL.test(c))
    .map((c) => `'${c}'`)
    .join(", ");
}

/**
 * ClickHouse condition over the `region` column for already-resolved IATA codes.
 * Empty list -> '' (no filter). One code -> `region = 'X'`; many -> `region IN ('X','Y')`.
 */
export function generateRegionCondition(codes: string[], alias: string = ""): string {
  const valid = codes.filter((c) => IATA_LITERAL.test(c));
  if (valid.length === 0) return "";
  const col = alias ? `${alias}.region` : "region";
  return valid.length === 1 ? `${col} = '${valid[0]}'` : `${col} IN (${quoteCodes(valid)})`;
}

/**
 * ClickHouse condition over the origin_path_info array (which has no `region` column),
 * deriving region per element via regionSql('x.5'). Empty list -> '' (no filter).
 */
export function generateRegionArrayCondition(codes: string[]): string {
  const valid = codes.filter((c) => IATA_LITERAL.test(c));
  if (valid.length === 0) return "";
  const expr = regionSql("x.5");
  const test = valid.length === 1 ? `${expr} = '${valid[0]}'` : `${expr} IN (${quoteCodes(valid)})`;
  return `arrayExists(x -> ${test}, origin_path_info)`;
}
