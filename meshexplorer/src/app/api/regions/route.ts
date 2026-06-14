import { NextResponse } from "next/server";
import { getAvailableRegions, getRegionGroups } from "@/lib/clickhouse/regions";

// Returns the dynamically-discovered region list (meshcore_regions MV) plus the region groups,
// both read from ClickHouse (region_groups is the single source of truth; getRegionGroups caches it).
export async function GET() {
  try {
    const [regions, groups] = await Promise.all([getAvailableRegions(), getRegionGroups()]);
    return NextResponse.json(
      { regions, groups },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (error) {
    console.error("Error fetching regions:", error);
    return NextResponse.json({ error: "Failed to fetch regions" }, { status: 500 });
  }
}
