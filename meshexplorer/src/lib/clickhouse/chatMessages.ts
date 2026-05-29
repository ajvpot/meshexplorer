/**
 * Builds the public-channel-messages aggregation as an inline subquery.
 *
 * This mirrors the `meshcore_public_channel_messages` view (group meshcore
 * packets by payload to dedup the same message seen via multiple gateways), but
 * lets callers push filters into the inner `meshcore_packets` scan instead of
 * filtering the fully-aggregated view output.
 *
 * Why this matters: in the view, `ingest_timestamp` is `max(ingest_timestamp)`
 * and `channel_hash` is derived from the grouped `payload`. A WHERE on those
 * columns can't be pushed below the GROUP BY, so ClickHouse must aggregate the
 * entire payload_type=5 history (millions of rows) on every query before the
 * filter applies — the timestamp primary key never gets used. Pushing the time
 * and channel filters into `innerConditions` lets partition + primary-key
 * pruning (ORDER BY starts with ingest_timestamp) kick in, turning a ~1 GiB
 * full scan into a few-millisecond ranged read.
 *
 * @param innerConditions Extra predicates applied to the meshcore_packets scan,
 *   before grouping. `payload_type = 5` is always included. Reference
 *   `ingest_timestamp` as `meshcore_packets.ingest_timestamp` — unqualified it
 *   binds to the `max(ingest_timestamp)` output alias and the query is rejected
 *   with ILLEGAL_AGGREGATION.
 */
export function publicChannelMessagesSubquery(innerConditions: string[] = []): string {
  const where = ["payload_type = 5", ...innerConditions].join(" AND ");
  return `(
    SELECT
      max(ingest_timestamp) AS ingest_timestamp,
      min(mesh_timestamp) AS mesh_timestamp,
      hex(substring(payload, 1, 1)) AS channel_hash,
      hex(substring(payload, 2, 2)) AS mac,
      substring(payload, 4) AS encrypted_message,
      count() AS message_count,
      groupArray((origin, hex(origin_pubkey), hex(path), broker, topic)) AS origin_path_info,
      any(packet_hash) AS message_id
    FROM meshcore_packets
    WHERE ${where}
    GROUP BY payload
  )`;
}
