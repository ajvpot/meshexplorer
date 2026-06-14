import { clickhouse } from "./clickhouse";
import { friendlyName } from "@/lib/regions";

export interface RegionOption {
  /** Canonical IATA region code, e.g. "SEA". */
  name: string;
  /** Display name (override map, else the bare code). */
  friendlyName: string;
  /** Distinct nodes seen in this region (last 30 days). */
  nodeCount: number;
  /** Most recent advert time in this region. */
  lastSeen: string;
}

/**
 * Reads the precomputed (hourly-refreshed) `meshcore_regions` materialized view.
 *
 * The region set is small and slow-moving, so it is precomputed on a schedule (see
 * ingest/migrations/004) rather than scanned live on every request. A brand-new region
 * appears here at the next MV refresh; explicit `?region=NEW` filtering still resolves live.
 */
export async function getAvailableRegions(): Promise<RegionOption[]> {
  const resultSet = await clickhouse.query({
    query: `SELECT region, node_count, last_seen FROM meshcore_regions ORDER BY region`,
    format: "JSONEachRow",
  });
  const rows = (await resultSet.json()) as Array<{
    region: string;
    node_count: number;
    last_seen: string;
  }>;
  return rows
    .filter((r) => r.region)
    .map((r) => ({
      name: r.region,
      friendlyName: friendlyName(r.region),
      nodeCount: Number(r.node_count),
      lastSeen: r.last_seen,
    }));
}
