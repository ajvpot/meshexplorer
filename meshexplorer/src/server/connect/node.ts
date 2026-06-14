import type { MessageInitShape } from "@bufbuild/protobuf";
import { Code, ConnectError, type ServiceImpl } from "@connectrpc/connect";
import { NodeService } from "@/gen/meshexplorer/v1/node_pb";
import type { SearchResultSchema } from "@/gen/meshexplorer/v1/node_pb";
import {
  getMeshcoreNodeInfo,
  getMeshcoreNodeNeighbors,
  searchMeshcoreNodes,
} from "@/lib/clickhouse/actions";
import { bool, num } from "./mappers";

interface SearchResultRow {
  public_key: string;
  node_name: string;
  latitude: number | null;
  longitude: number | null;
  has_location: number;
  is_repeater: number;
  is_chat_node: number;
  is_room_server: number;
  has_name: number;
  first_heard: string;
  last_seen: string;
  broker: string;
  topic: string;
}

function toSearchResult(row: SearchResultRow): MessageInitShape<typeof SearchResultSchema> {
  return {
    publicKey: row.public_key,
    nodeName: row.node_name,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    hasLocation: num(row.has_location),
    isRepeater: num(row.is_repeater),
    isChatNode: num(row.is_chat_node),
    isRoomServer: num(row.is_room_server),
    hasName: num(row.has_name),
    firstHeard: row.first_heard,
    lastSeen: row.last_seen,
    broker: row.broker,
    topic: row.topic,
  };
}

export const nodeServiceImpl: ServiceImpl<typeof NodeService> = {
  async getNode(req) {
    const publicKey = req.publicKey.toUpperCase();
    const nodeInfo = await getMeshcoreNodeInfo(publicKey, req.limit ?? 50);

    if (!nodeInfo) {
      throw new ConnectError(`node not found: ${publicKey}`, Code.NotFound);
    }

    const node = nodeInfo.node;
    // recentAdverts / locationHistory come back as untyped JSON rows.
    const adverts = nodeInfo.recentAdverts as Array<{
      adv_timestamp: number;
      origin_path_pubkey_tuples: Array<[string, string, string]>;
      advert_count: number;
      earliest_timestamp: string;
      latest_timestamp: string;
      latitude: number | null;
      longitude: number | null;
      is_repeater: number;
      is_chat_node: number;
      is_room_server: number;
      has_location: number;
      packet_hash: string;
    }>;
    const locationHistory = nodeInfo.locationHistory as Array<{
      mesh_timestamp: string;
      latitude: number;
      longitude: number;
    }>;

    return {
      node: {
        publicKey: node.public_key,
        nodeName: node.node_name,
        latitude: node.latitude ?? undefined,
        longitude: node.longitude ?? undefined,
        hasLocation: num(node.has_location),
        isRepeater: num(node.is_repeater),
        isChatNode: num(node.is_chat_node),
        isRoomServer: num(node.is_room_server),
        hasName: num(node.has_name),
        broker: node.broker ?? undefined,
        topic: node.topic ?? undefined,
        firstSeen: node.first_seen,
        lastSeen: node.last_seen,
      },
      recentAdverts: adverts.map((a) => ({
        advTimestamp: num(a.adv_timestamp),
        originPathPubkeyTuples: (a.origin_path_pubkey_tuples ?? []).map(
          ([origin, path, originPubkey]) => ({ origin, path, originPubkey }),
        ),
        advertCount: num(a.advert_count),
        earliestTimestamp: a.earliest_timestamp,
        latestTimestamp: a.latest_timestamp,
        latitude: a.latitude ?? undefined,
        longitude: a.longitude ?? undefined,
        isRepeater: num(a.is_repeater),
        isChatNode: num(a.is_chat_node),
        isRoomServer: num(a.is_room_server),
        hasLocation: num(a.has_location),
        packetHash: a.packet_hash,
      })),
      locationHistory: locationHistory.map((l) => ({
        meshTimestamp: l.mesh_timestamp,
        latitude: l.latitude,
        longitude: l.longitude,
      })),
      mqtt: {
        isUplinked: bool(nodeInfo.mqtt.is_uplinked),
        hasPackets: bool(nodeInfo.mqtt.has_packets),
        topics: nodeInfo.mqtt.topics.map((t) => ({
          topic: t.topic,
          broker: t.broker,
          lastPacketTime: t.last_packet_time,
          isRecent: bool(t.is_recent),
        })),
      },
      region: nodeInfo.region ?? undefined,
    };
  },

  async getNodeNeighbors(req) {
    const neighbors = await getMeshcoreNodeNeighbors(
      req.publicKey.toUpperCase(),
      req.lastSeen === undefined ? null : String(req.lastSeen),
    );
    return {
      neighbors: neighbors.map((n) => ({
        publicKey: n.public_key,
        nodeName: n.node_name,
        latitude: n.latitude ?? undefined,
        longitude: n.longitude ?? undefined,
        hasLocation: num(n.has_location),
        isRepeater: num(n.is_repeater),
        isChatNode: num(n.is_chat_node),
        isRoomServer: num(n.is_room_server),
        hasName: num(n.has_name),
        directions: n.directions,
      })),
    };
  },

  async searchNodes(req) {
    if (req.queries.length === 0) {
      return { results: [] };
    }

    const queries = req.queries.map((q) => ({
      query: q.query,
      region: q.region,
      lastSeen: q.lastSeen === undefined ? null : String(q.lastSeen),
      limit: q.limit ?? 50,
      exact: q.exact ?? false,
      is_repeater: q.isRepeater,
    }));

    const grouped = (await searchMeshcoreNodes(queries)) as SearchResultRow[][];

    return {
      results: grouped.map((group) => ({
        results: group.map(toSearchResult),
      })),
    };
  },
};
