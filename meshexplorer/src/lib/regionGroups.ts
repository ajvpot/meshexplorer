export interface RegionGroup {
  /** Group key, e.g. "PNW". 3-letter by convention; must NOT collide with a live region code. */
  code: string;
  /** Display name, e.g. "Pacific Northwest". */
  name: string;
  /** Member IATA region codes (uppercase). */
  members: string[];
}

/**
 * Region groups: named sets of IATA region codes used for filtering + display.
 *
 * This is the authoritative TS mirror of the `region_groups` seed in
 * ingest/migrations/004_region_handle_and_groups.sql. The parity script
 * (scripts/region-parity.ts) enforces that this list and the SQL seed stay identical.
 *
 * Validated against prod data (492 live regions): every member topic exists, and no group
 * code collides with a live region code (resolveSelector resolves group-first regardless).
 */
export const REGION_GROUPS: RegionGroup[] = [
  {
    code: "PNW",
    name: "Pacific Northwest",
    members: [
      "SEA", "PDX", "YVR", "BLI", "GEG", "OLM", "PAE", "EAT", "RLD", "PUW",
      "KEH", "KLS", "TDO", "EUG", "CVO", "MFR", "TTD", "SLE", "MMV", "ONP",
      "LMT", "OTH", "YCD", "YYJ", "YKA",
    ],
  },
  {
    code: "CAL",
    name: "California",
    members: ["LAX", "SFO", "SJC", "OAK", "SMF", "SAN", "OXR"],
  },
  {
    code: "DEU",
    name: "Germany",
    members: ["BER", "HAM", "MUC", "FRA", "CGN", "DUS", "STR", "LEJ", "BWE", "HAJ", "NUE"],
  },
  {
    code: "POL",
    name: "Poland",
    members: ["WAW", "KRK", "WRO", "POZ", "GDN", "KTW", "LCJ", "BZG"],
  },
];

const BY_CODE = new Map<string, RegionGroup>(
  REGION_GROUPS.map((g) => [g.code.toUpperCase(), g]),
);

/** Look up a group by code (case-insensitive). */
export function getRegionGroup(code?: string | null): RegionGroup | undefined {
  if (!code) return undefined;
  return BY_CODE.get(code.trim().toUpperCase());
}

/** Display name for a group code, or undefined if the code is not a group. */
export function groupNameOf(code?: string | null): string | undefined {
  return getRegionGroup(code)?.name;
}
