import type { ServiceImpl } from "@connectrpc/connect";
import { NeighborsService } from "@/gen/meshexplorer/v1/neighbors_pb";
import { getAllNodeNeighbors } from "@/lib/clickhouse/actions";
import { numToParam, toNeighborEdge } from "./mappers";

export const neighborsServiceImpl: ServiceImpl<typeof NeighborsService> = {
  async getAllNeighbors(req) {
    const neighbors = await getAllNodeNeighbors(
      numToParam(req.lastSeen),
      numToParam(req.minLat),
      numToParam(req.maxLat),
      numToParam(req.minLng),
      numToParam(req.maxLng),
      req.nodeTypes,
      req.region,
    );
    return { neighbors: neighbors.map(toNeighborEdge) };
  },
};
