import type { ServiceImpl } from "@connectrpc/connect";
import { StatsService } from "@/gen/meshexplorer/v1/stats_pb";
import { clickhouse } from "@/lib/clickhouse/clickhouse";
import {
  generateRegionWhereClause,
  generateRegionWhereClauseFromArray,
} from "@/lib/regionFilters";

export const statsServiceImpl: ServiceImpl<typeof StatsService> = {
  async getTotalNodes(req) {
    const regionFilter = generateRegionWhereClause(req.region);
    const whereClause = regionFilter.whereClause ? `WHERE ${regionFilter.whereClause}` : "";
    const query = `SELECT count(DISTINCT public_key) AS total_nodes FROM meshcore_adverts ${whereClause}`;
    const resultSet = await clickhouse.query({ query, format: "JSONEachRow" });
    const rows = (await resultSet.json()) as Array<{ total_nodes: number }>;
    return { totalNodes: rows.length > 0 ? Number(rows[0].total_nodes) : 0 };
  },

  async getNodesOverTime(req) {
    const regionFilter = generateRegionWhereClause(req.region);
    const regionWhereClause = regionFilter.whereClause ? `WHERE ${regionFilter.whereClause}` : "";
    const query = `
      WITH all_nodes AS (
        SELECT toDate(ingest_timestamp) AS day, public_key, latitude, longitude, is_repeater, is_room_server
        FROM meshcore_adverts
        ${regionWhereClause}
      ),
      all_days AS (
        SELECT DISTINCT day FROM all_nodes
        ORDER BY day ASC
      ),
      rolling_window AS (
        SELECT
          d.day,
          n.public_key,
          n.latitude,
          n.longitude,
          n.is_repeater,
          n.is_room_server
        FROM all_days d
        INNER JOIN all_nodes n ON n.day BETWEEN (d.day - INTERVAL 6 DAY) AND d.day
      )
      SELECT day,
        count(DISTINCT public_key) AS cumulative_unique_nodes,
        count(DISTINCT CASE WHEN latitude IS NOT NULL AND longitude IS NOT NULL AND latitude != 0 AND longitude != 0 THEN public_key END) AS nodes_with_location,
        count(DISTINCT CASE WHEN latitude IS NULL OR longitude IS NULL OR latitude = 0 OR longitude = 0 THEN public_key END) AS nodes_without_location,
        count(DISTINCT CASE WHEN is_repeater = 1 THEN public_key END) AS repeaters,
        count(DISTINCT CASE WHEN is_room_server = 1 THEN public_key END) AS room_servers
      FROM rolling_window
      GROUP BY day
      ORDER BY day ASC
    `;
    const resultSet = await clickhouse.query({ query, format: "JSONEachRow" });
    const rows = (await resultSet.json()) as Array<{
      day: string;
      cumulative_unique_nodes: number;
      nodes_with_location: number;
      nodes_without_location: number;
      repeaters: number;
      room_servers: number;
    }>;
    return {
      data: rows.map((r) => ({
        day: r.day,
        cumulativeUniqueNodes: Number(r.cumulative_unique_nodes),
        nodesWithLocation: Number(r.nodes_with_location),
        nodesWithoutLocation: Number(r.nodes_without_location),
        repeaters: Number(r.repeaters),
        roomServers: Number(r.room_servers),
      })),
    };
  },

  async getPopularChannels(req) {
    const regionFilter = generateRegionWhereClauseFromArray(req.region);
    const whereClause = regionFilter.whereClause ? `WHERE ${regionFilter.whereClause}` : "";
    const query = `
      SELECT channel_hash, count() AS message_count
      FROM meshcore_public_channel_messages
      ${whereClause}
      GROUP BY channel_hash
      ORDER BY message_count DESC
      LIMIT 10
    `;
    const resultSet = await clickhouse.query({ query, format: "JSONEachRow" });
    const rows = (await resultSet.json()) as Array<{ channel_hash: string; message_count: number }>;
    return {
      data: rows.map((r) => ({
        channelHash: r.channel_hash,
        messageCount: Number(r.message_count),
      })),
    };
  },

  async getRepeaterPrefixes(req) {
    const regionFilter = generateRegionWhereClause(req.region);
    const regionWhereClause = regionFilter.whereClause ? `AND ${regionFilter.whereClause}` : "";
    const query = `
      SELECT
          substring(public_key, 1, 2) as prefix,
          count() as node_count,
          groupArray(node_name) as node_names
      FROM meshcore_adverts_latest
      WHERE is_repeater = 1
          AND last_seen >= now() - INTERVAL 2 DAY
          ${regionWhereClause}
      GROUP BY prefix
      ORDER BY node_count DESC, prefix ASC
    `;
    const resultSet = await clickhouse.query({ query, format: "JSONEachRow" });
    const rows = (await resultSet.json()) as Array<{
      prefix: string;
      node_count: number;
      node_names: string[];
    }>;
    return {
      data: rows.map((r) => ({
        prefix: r.prefix,
        nodeNames: r.node_names,
      })),
    };
  },
};
