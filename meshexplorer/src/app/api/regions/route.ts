import { NextResponse } from "next/server";
import { getAvailableRegions } from "@/lib/clickhouse/regions";
import { REGION_GROUPS } from "@/lib/regionGroups";

// Returns the dynamically-discovered region list (from the meshcore_regions MV) plus the
// region groups. Groups come straight from the TS source of truth (REGION_GROUPS), which the
// parity script keeps identical to the seeded region_groups table that Grafana reads.
export async function GET() {
  try {
    const regions = await getAvailableRegions();
    return NextResponse.json(
      { regions, groups: REGION_GROUPS },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    console.error("Error fetching regions:", error);
    return NextResponse.json({ error: "Failed to fetch regions" }, { status: 500 });
  }
}
