/**
 * Builds the public-channel-messages aggregation as an inline subquery.
 *
 * Reads the live, pre-decoded `meshcore_public_channel_messages_raw` materialized
 * view (one row per gateway-copy of a payload_type=5 packet) and dedups the same
 * message seen via multiple gateways with `GROUP BY message_id`. Callers push
 * filters into the inner scan instead of filtering the fully-aggregated output.
 *
 * Why this matters: in the output, `ingest_timestamp` is `max(ingest_timestamp)`
 * and `channel_hash`/`mac`/`encrypted_message` are `any(...)` over the message_id
 * group. A WHERE on those columns can't be pushed below the GROUP BY. Pushing the
 * time and channel filters into `innerConditions` lets partition + primary-key
 * pruning kick in — the table's ORDER BY is `(channel_hash, ingest_timestamp)`, so
 * a per-channel timestamp range is a few-millisecond ranged read instead of a full
 * scan + merge.
 *
 * @param innerConditions Extra predicates applied to the
 *   meshcore_public_channel_messages_raw scan, before grouping. Reference columns
 *   table-qualified (e.g. `meshcore_public_channel_messages_raw.ingest_timestamp`,
 *   `meshcore_public_channel_messages_raw.channel_hash`) — unqualified they bind to
 *   the aggregate output aliases and the query is rejected with ILLEGAL_AGGREGATION.
 */
export function publicChannelMessagesSubquery(innerConditions: string[] = []): string {
  const where = innerConditions.length > 0 ? `WHERE ${innerConditions.join(" AND ")}` : "";
  return `(
    SELECT
      any(channel_hash) AS channel_hash,
      max(ingest_timestamp) AS ingest_timestamp,
      min(mesh_timestamp) AS mesh_timestamp,
      any(mac) AS mac,
      any(encrypted_message) AS encrypted_message,
      count() AS message_count,
      groupArray((origin, origin_pubkey, path, broker, topic)) AS origin_path_info,
      any(hash_size) AS hash_size,
      message_id
    FROM meshcore_public_channel_messages_raw
    ${where}
    GROUP BY message_id
  )`;
}
