import type { ServiceImpl } from "@connectrpc/connect";
import { PacketsService } from "@/gen/meshexplorer/v1/packets_pb";
import {
  createClickHouseStreamer,
  createMeshcorePacketsStreamerConfig,
} from "@/lib/clickhouse/streaming";
import { num } from "./mappers";

interface PacketRow {
  ingest_timestamp: string;
  mesh_timestamp: string;
  broker: string;
  topic: string;
  packet: string;
  path_len: number;
  path: string;
  route_type: number;
  payload_type: number;
  payload_version: number;
  header: number;
  origin_pubkey: string;
}

export const packetsServiceImpl: ServiceImpl<typeof PacketsService> = {
  async *streamPackets(req) {
    const originPubkey = req.originPubkey ? req.originPubkey.toUpperCase() : undefined;
    const config = createMeshcorePacketsStreamerConfig(
      req.region,
      req.payloadType,
      req.routeType,
      originPubkey,
    );
    config.pollInterval = req.pollInterval ?? 500;
    config.maxRowsPerPoll = req.maxRows ?? 10;

    const streamer = createClickHouseStreamer<PacketRow>(config);

    const params: Record<string, unknown> = {};
    if (req.payloadType !== undefined) params.payloadType = req.payloadType;
    if (req.routeType !== undefined) params.routeType = req.routeType;
    if (originPubkey) params.originPubkey = originPubkey;

    for await (const result of streamer(params)) {
      const row = result.row;
      yield {
        packet: {
          ingestTimestamp: row.ingest_timestamp,
          meshTimestamp: row.mesh_timestamp,
          broker: row.broker,
          topic: row.topic,
          packet: row.packet,
          pathLen: num(row.path_len),
          path: row.path,
          routeType: num(row.route_type),
          payloadType: num(row.payload_type),
          payloadVersion: num(row.payload_version),
          header: num(row.header),
          originPubkey: row.origin_pubkey,
        },
      };
    }
  },
};
