#!/usr/bin/env node
/**
 * Offline generator for data-driven region groups.
 *
 * The region_groups ClickHouse table is the single source of truth (the app reads it cached;
 * Grafana reads it directly). This script regenerates its membership from real data:
 *
 *   1. Reads cross-region packet co-occurrence from ClickHouse (a configurable broker + window).
 *   2. Single-linkage clusters regions by mutual overlap (min-share) at two thresholds:
 *        region-level (broad, e.g. "Pacific Northwest") and metro-level (tight, e.g. "Puget Sound").
 *   3. Names new clusters via `claude -p`; reconciles to existing groups by member overlap so a
 *      group keeps its stable code + name across re-runs (membership can drift; the permalink does not).
 *   4. Emits the `INSERT INTO region_groups ...` seed on stdout. Apply it (TRUNCATE + INSERT) or
 *      paste it into the migration.
 *
 * Run (against the local snapshot):
 *   CLICKHOUSE_HOST=127.0.0.1 CLICKHOUSE_PORT=8123 CLICKHOUSE_USER=default CLICKHOUSE_PASSWORD= \
 *     npx tsx scripts/generate-region-groups.ts
 */
import { createClient } from "@clickhouse/client";
import { execFileSync } from "child_process";

// ---- config (env-overridable; defaults = the validated letsmesh sample) ----
const BROKER = process.env.RG_BROKER ?? "wss://mqtt-us-v1.letsmesh.net:443";
const FROM = process.env.RG_FROM ?? "2026-05-29";
const TO = process.env.RG_TO ?? "2026-06-03";
const MAX_REGIONS_PER_PACKET = Number(process.env.RG_MAX_REGIONS ?? 12);
const FLOOR = Number(process.env.RG_FLOOR ?? 5); // min absolute shared packets per pair
const REGION_T = Number(process.env.RG_REGION_T ?? 0.2); // broad cluster threshold
const METRO_T = Number(process.env.RG_METRO_T ?? 0.35); // tight cluster threshold
const MIN_REGION_SIZE = Number(process.env.RG_MIN_REGION ?? 3);
const MIN_METRO_SIZE = Number(process.env.RG_MIN_METRO ?? 2);
const RECONCILE_JACCARD = 0.5;

const client = createClient({
  url: `http://${process.env.CLICKHOUSE_HOST ?? "127.0.0.1"}:${process.env.CLICKHOUSE_PORT ?? "8123"}`,
  username: process.env.CLICKHOUSE_USER ?? "default",
  password: process.env.CLICKHOUSE_PASSWORD ?? "",
});

const BASE =
  `broker = {broker:String} AND region != '' AND packet_hash != '' AND length(payload) > 0 ` +
  `AND ingest_timestamp >= {from:String} AND ingest_timestamp < {to:String}`;

async function q<T>(query: string): Promise<T[]> {
  const rs = await client.query({
    query,
    query_params: { broker: BROKER, from: FROM, to: TO },
    format: "JSONEachRow",
  });
  return rs.json<T>();
}

async function main() {
  const totalsRows = await q<{ region: string; total: string }>(`
    SELECT region, count() AS total FROM (
      SELECT packet_hash, groupUniqArray(region) AS regs FROM meshcore_packets WHERE ${BASE}
      GROUP BY packet_hash HAVING length(regs) BETWEEN 1 AND ${MAX_REGIONS_PER_PACKET}
    ) ARRAY JOIN regs AS region GROUP BY region`);
  const pairRows = await q<{ a: string; b: string; shared: string }>(`
    SELECT least(r1,r2) AS a, greatest(r1,r2) AS b, count() AS shared FROM (
      SELECT packet_hash, groupUniqArray(region) AS regs FROM meshcore_packets WHERE ${BASE}
      GROUP BY packet_hash HAVING length(regs) BETWEEN 2 AND ${MAX_REGIONS_PER_PACKET}
    ) ARRAY JOIN regs AS r1 ARRAY JOIN regs AS r2 WHERE r1 < r2 GROUP BY a, b`);

  // Existing groups (the region_groups table is the source of truth) — used to reconcile codes +
  // names so a cluster keeps its identity across re-runs even as membership drifts.
  const existing = await q<{ code: string; name: string; members: string[] }>(`
    SELECT group_code AS code, any(group_name) AS name, groupArray(region_code) AS members
    FROM region_groups GROUP BY group_code`);

  const total: Record<string, number> = {};
  for (const r of totalsRows) total[r.region] = +r.total;
  const edges = pairRows
    .map((p) => ({ a: p.a, b: p.b, shared: +p.shared }))
    .filter((e) => total[e.a] && total[e.b]);
  const sim = (e: { a: string; b: string; shared: number }) =>
    Math.min(e.shared / total[e.a], e.shared / total[e.b]);

  function components(t: number): string[][] {
    const parent: Record<string, string> = {};
    const find = (x: string): string => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };
    for (const r of Object.keys(total)) parent[r] = r;
    for (const e of edges) if (e.shared >= FLOOR && sim(e) >= t) parent[find(e.a)] = find(e.b);
    const g: Record<string, string[]> = {};
    for (const r of Object.keys(total)) (g[find(r)] ??= []).push(r);
    return Object.values(g);
  }
  const byVol = (m: string[]) => m.slice().sort((x, y) => total[y] - total[x]);

  const regionClusters = components(REGION_T).filter((m) => m.length >= MIN_REGION_SIZE);
  const metroClusters = components(METRO_T).filter((m) => m.length >= MIN_METRO_SIZE);

  // Group set: every region cluster, plus metro clusters that strictly subdivide a multi-metro region.
  type G = { level: "region" | "metro"; members: string[]; dominant: string };
  const groups: G[] = [];
  for (const rc of regionClusters) {
    groups.push({ level: "region", members: byVol(rc), dominant: byVol(rc)[0] });
    const subs = metroClusters.filter((mc) => mc.every((r) => rc.includes(r)) && mc.length < rc.length);
    if (subs.length >= 2) for (const mc of subs) groups.push({ level: "metro", members: byVol(mc), dominant: byVol(mc)[0] });
  }

  // Reconcile to existing codes/names by best member-overlap (Jaccard) for stability across re-runs.
  const jaccard = (a: string[], b: string[]) => {
    const A = new Set(a), B = new Set(b);
    let inter = 0;
    for (const x of A) if (B.has(x)) inter++;
    return inter / (A.size + B.size - inter);
  };
  const out = groups
    .sort((x, y) => (x.level === y.level ? y.members.length - x.members.length : x.level === "region" ? -1 : 1))
    .map((g) => {
      let best = { j: 0, code: "", name: "" };
      for (const ex of existing) {
        const j = jaccard(g.members, ex.members);
        if (j > best.j) best = { j, code: ex.code, name: ex.name };
      }
      const matched = best.j >= RECONCILE_JACCARD;
      return {
        code: matched ? best.code : "",
        name: matched ? best.name : "",
        matched,
        level: g.level,
        dominant: g.dominant,
        size: g.members.length,
        matchJaccard: +best.j.toFixed(2),
        members: g.members,
      };
    });

  // Name the NEW (unmatched) clusters via the Claude CLI; matched clusters keep their stable
  // code + name. Derive a stable slug code from the generated name.
  fillNames(out.filter((g) => !g.matched));
  // Stable, IATA-disjoint code derived from the (reconciled-or-generated) name.
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  for (const g of out) g.code = g.name ? slug(g.name) : `g-${g.dominant.toLowerCase()}`;

  console.error(
    `# regions=${Object.keys(total).length} edges=${edges.length} | broker=${BROKER} ${FROM}..${TO}\n` +
    `# region_T=${REGION_T} metro_T=${METRO_T} floor=${FLOOR} | ${out.length} groups ` +
    `(${out.filter((g) => g.level === "region").length} region, ${out.filter((g) => g.level === "metro").length} metro)`
  );
  for (const g of out) {
    console.error(
      `  ${g.level.padEnd(6)} ${String(g.size).padStart(2)}  ${(g.code || "(no code)").padEnd(20)} ${g.name || "(needs name)"}\n` +
      `         ${g.members.join(" ")}`
    );
  }
  // Emit the region_groups seed (single source of truth) on stdout — apply to ClickHouse or paste
  // into the migration. (Re-seed: TRUNCATE TABLE region_groups; <this INSERT>.)
  const rows: string[] = [];
  for (const g of out) for (const m of g.members) rows.push(`  ('${g.code}','${g.name.replace(/'/g, "''")}','${m}')`);
  console.log("INSERT INTO region_groups (group_code, group_name, region_code) VALUES\n" + rows.join(",\n") + ";");
  await client.close();
}

// Generate friendly names for clusters via `claude -p`, in one batched call. Mutates g.name.
function fillNames(need: Array<{ level: string; members: string[]; name: string }>) {
  if (!need.length) return;
  const list = need.map((g, i) => `${i + 1}. [${g.level}] ${g.members.join(" ")}`).join("\n");
  const prompt =
    `These are clusters of IATA airport/city codes that form geographically-adjacent regions in a LoRa ` +
    `mesh network. Give each a short, distinct human-friendly geographic name. "region" = a broad area ` +
    `(e.g. "Pacific Northwest"); "metro" = a metropolitan/local area (e.g. "Puget Sound"). 1-4 words, ` +
    `no surrounding quotes. Respond with ONLY a JSON array of exactly ${need.length} strings, in order.\n\n` +
    list;
  let resp = "";
  try {
    resp = execFileSync("claude", ["-p", prompt], { encoding: "utf8", maxBuffer: 1 << 24 });
  } catch (e: any) {
    console.error("claude -p failed; names left blank:", e?.message);
    return;
  }
  const m = resp.match(/\[[\s\S]*\]/);
  if (!m) { console.error("no JSON array in claude output:\n" + resp.slice(0, 600)); return; }
  let names: unknown;
  try { names = JSON.parse(m[0]); } catch { console.error("bad JSON from claude:\n" + m[0].slice(0, 600)); return; }
  if (Array.isArray(names)) need.forEach((g, i) => { if (typeof names[i] === "string") g.name = names[i].trim(); });
}
main().catch((e) => { console.error(e); process.exit(1); });
