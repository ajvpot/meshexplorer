import type { ServiceImpl } from "@connectrpc/connect";
import { MapService } from "@/gen/meshexplorer/v1/map_pb";
import { getNodePositions, getAllNodeNeighbors } from "@/lib/clickhouse/actions";
import { numToParam, toNeighborEdge, type NeighborEdgeRow } from "./mappers";

export const mapServiceImpl: ServiceImpl<typeof MapService> = {
  async getMap(req) {
    const minLat = numToParam(req.minLat);
    const maxLat = numToParam(req.maxLat);
    const minLng = numToParam(req.minLng);
    const maxLng = numToParam(req.maxLng);
    const lastSeen = numToParam(req.lastSeen);

    const positions = await getNodePositions({
      minLat,
      maxLat,
      minLng,
      maxLng,
      nodeTypes: req.nodeTypes,
      lastSeen,
    });

    let neighbors: NeighborEdgeRow[] = [];
    if (req.includeNeighbors) {
      neighbors = await getAllNodeNeighbors(
        lastSeen,
        minLat,
        maxLat,
        minLng,
        maxLng,
        req.nodeTypes,
        req.region,
      );
    }

    return {
      nodes: positions.map((p) => ({
        nodeId: p.node_id,
        name: p.name ?? undefined,
        shortName: p.short_name ?? undefined,
        latitude: p.latitude,
        longitude: p.longitude,
        lastSeen: p.last_seen,
        firstSeen: p.first_seen ?? undefined,
        type: p.type,
      })),
      neighbors: neighbors.map(toNeighborEdge),
    };
  },
};
