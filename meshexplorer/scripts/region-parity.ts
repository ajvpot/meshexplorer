#!/usr/bin/env node
/**
 * Region parity check (no test runner in this repo — run via `npm run check:regions`).
 *
 * Guards the single-source-of-truth invariants between the TS region layer and the SQL
 * migration so they cannot drift silently:
 *   (a) regionSql('topic') == the `region` ALIAS body in migration 004 (sentinel-wrapped),
 *       and every inline copy of the derivation in the migration is identical.
 *   (b) the region_groups seed in migration 004 == REGION_GROUPS in src/lib/regionGroups.ts.
 *   (c) every group member is a valid IATA code (normalizeRegion(m) === m).
 *   (d) group codes are unique and disjoint from region members (the live-region disjointness
 *       check is part of the migration verification, not this static check).
 *   (e) resolveSelector behaves (group expansion, legacy slugs, unknown -> []).
 *
 * Exits non-zero on any failure.
 */
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { regionSql, normalizeRegion, resolveSelector } from "../src/lib/regions";
import { REGION_GROUPS } from "../src/lib/regionGroups";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationPath = join(__dirname, "..", "..", "ingest", "migrations", "004_region_handle_and_groups.sql");
const sql = readFileSync(migrationPath, "utf8");

const failures: string[] = [];
const ok: string[] = [];
const check = (name: string, cond: boolean, detail = "") => {
  if (cond) ok.push(name);
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
};
const norm = (s: string) => s.replace(/\s+/g, " ").trim();

// ---- (a) derivation parity ----
const canonical = regionSql("topic");
const sentinel = sql.match(/REGION-DERIVATION-CANONICAL\s*\n([\s\S]*?)\n\s*--\s*REGION-DERIVATION-CANONICAL-END/);
check("ALIAS sentinel block present", !!sentinel);
if (sentinel) {
  const aliasBody = sentinel[1].replace(/^\s*--.*$/gm, "").replace(/\bALIAS\b/, "").trim();
  check("ALIAS body == regionSql('topic')", norm(aliasBody) === norm(canonical),
    `\n  migration: ${norm(aliasBody)}\n  regionSql: ${norm(canonical)}`);
}
// every region-multiIf start must be part of a full canonical literal (no drifted inline copies)
const starts = (sql.match(/multiIf\(lower\(topic\) IN \('meshcore'/g) || []).length;
const fulls = sql.split(canonical).length - 1;
check("all inline derivations identical to canonical", starts > 0 && starts === fulls,
  `region-multiIf starts=${starts}, exact canonical copies=${fulls}`);

// ---- (b) seed parity ----
const insertMatch = sql.match(/INSERT INTO region_groups[^;]*VALUES([\s\S]*?);/i);
check("region_groups seed INSERT present", !!insertMatch);
const seedTriples = new Set<string>();
if (insertMatch) {
  const re = /\(\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(insertMatch[1])) !== null) seedTriples.add(`${m[1]}|${m[2]}|${m[3]}`);
}
const tsTriples = new Set<string>();
for (const g of REGION_GROUPS) for (const member of g.members) tsTriples.add(`${g.code}|${g.name}|${member}`);
const missingInSeed = [...tsTriples].filter((t) => !seedTriples.has(t));
const extraInSeed = [...seedTriples].filter((t) => !tsTriples.has(t));
check("seed triples == REGION_GROUPS", missingInSeed.length === 0 && extraInSeed.length === 0,
  `missingInSeed=${JSON.stringify(missingInSeed)} extraInSeed=${JSON.stringify(extraInSeed)}`);

// ---- (c) members are valid IATA ----
const badMembers = REGION_GROUPS.flatMap((g) => g.members.filter((m) => normalizeRegion(m) !== m).map((m) => `${g.code}:${m}`));
check("all group members are canonical IATA", badMembers.length === 0, JSON.stringify(badMembers));

// ---- (d) group codes unique + disjoint from members ----
const codes = REGION_GROUPS.map((g) => g.code);
check("group codes are unique", new Set(codes).size === codes.length, JSON.stringify(codes));
const allMembers = new Set(REGION_GROUPS.flatMap((g) => g.members));
const codeIsMember = codes.filter((c) => allMembers.has(c));
check("group codes are not region members", codeIsMember.length === 0, JSON.stringify(codeIsMember));

// ---- (e) resolveSelector behavior ----
const pnw = REGION_GROUPS.find((g) => g.code === "PNW");
check("resolveSelector('PNW') expands to members", !!pnw && resolveSelector("PNW").length === new Set(pnw.members).size);
check("resolveSelector legacy slug 'seattle' -> ['SEA']", JSON.stringify(resolveSelector("seattle")) === JSON.stringify(["SEA"]));
check("resolveSelector('BOGUS') -> []", resolveSelector("BOGUS").length === 0);
check("resolveSelector('') -> []", resolveSelector("").length === 0);

// ---- report ----
console.log(`region-parity: ${ok.length} passed, ${failures.length} failed`);
if (failures.length) {
  console.error("\nFAILURES:\n - " + failures.join("\n - "));
  process.exit(1);
}
console.log("All region parity checks passed.");
