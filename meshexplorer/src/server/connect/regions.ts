import type { ServiceImpl } from "@connectrpc/connect";
import { RegionsService } from "@/gen/meshexplorer/v1/regions_pb";
import { getAvailableRegions, getRegionGroups } from "@/lib/clickhouse/regions";
import { num } from "./mappers";

export const regionsServiceImpl: ServiceImpl<typeof RegionsService> = {
  async getRegions() {
    const [regions, groups] = await Promise.all([getAvailableRegions(), getRegionGroups()]);
    return {
      regions: regions.map((r) => ({
        name: r.name,
        friendlyName: r.friendlyName,
        nodeCount: num(r.nodeCount),
        lastSeen: r.lastSeen,
      })),
      groups: groups.map((g) => ({
        code: g.code,
        name: g.name,
        members: g.members,
      })),
    };
  },
};
