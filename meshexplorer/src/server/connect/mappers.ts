import type { MessageInitShape } from "@bufbuild/protobuf";
import type { NeighborEdgeSchema } from "@/gen/meshexplorer/v1/common_pb";

// Row shape returned by getAllNodeNeighbors() / getNodePositions() neighbor data.
export interface NeighborEdgeRow {
  source_node: string;
  target_node: string;
  connection_type: string;
  packet_count: number;
  source_name: string;
  source_latitude: number;
  source_longitude: number;
  source_has_location: number;
  target_name: string;
  target_latitude: number;
  target_longitude: number;
  target_has_location: number;
}

// ClickHouse serializes UInt64/Int64 and aggregate columns (count(), etc.) as
// JSON *strings* in JSONEachRow. Coerce every integer field we feed into an
// int32 proto field, or protobuf-es rejects the string at encode time.
export function num(v: unknown): number {
  return Number(v ?? 0);
}

// ClickHouse returns UInt8 boolean-ish columns (e.g. is_recent) as JSON numbers
// (1/0). Coerce before feeding a proto `bool` field.
export function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "1";
}

/** Maps a ClickHouse neighbor-edge row to the NeighborEdge proto init shape. */
export function toNeighborEdge(row: NeighborEdgeRow): MessageInitShape<typeof NeighborEdgeSchema> {
  return {
    sourceNode: row.source_node,
    targetNode: row.target_node,
    connectionType: row.connection_type,
    packetCount: num(row.packet_count),
    sourceName: row.source_name,
    sourceLatitude: row.source_latitude,
    sourceLongitude: row.source_longitude,
    sourceHasLocation: num(row.source_has_location),
    targetName: row.target_name,
    targetLatitude: row.target_latitude,
    targetLongitude: row.target_longitude,
    targetHasLocation: num(row.target_has_location),
  };
}

/** Converts an optional numeric request field to the `string | null` the actions expect. */
export function numToParam(n: number | undefined): string | null {
  return n === undefined ? null : String(n);
}
