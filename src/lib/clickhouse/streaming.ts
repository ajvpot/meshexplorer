import { clickhouse } from './clickhouse';
import { generateRegionConditionForStreaming, generateRegionArrayConditionForStreaming } from '../regionFilters';

/**
 * Configuration for the ClickHouse streaming poller
 */
export interface StreamingConfig {
  /** The base query template with placeholders for parameters */
  queryTemplate: string;
  /** Time column to use for polling (must be a DateTime/DateTime64 column) */
  timeColumn: string;
  /** Polling interval in milliseconds (default: 1000) */
  pollInterval?: number;
  /** Maximum number of rows to fetch per poll (default: 1000) */
  maxRowsPerPoll?: number;
  /** Custom WHERE clause to add to the query (optional) */
  additionalWhereClause?: string;
  /** Skip initial messages and only stream new ones (default: false) */
  skipInitialMessages?: boolean;
}

/**
 * Parameters that can be passed to the streaming function
 */
export interface StreamingParams {
  /** Additional query parameters to be passed to ClickHouse */
  [key: string]: any;
}

/**
 * Result of a streaming poll
 */
export interface StreamingResult<T = any> {
  /** The new row found in this poll */
  row: T;
  /** The timestamp of the last row (for next poll) */
  lastTimestamp: string;
}

/**
 * Creates a generator function that polls ClickHouse for new rows based on a time column
 * 
 * @param config Configuration for the streaming poller
 * @returns A generator function that yields new rows as they become available
 * 
 * @example
 * ```typescript
 * const config: StreamingConfig = {
 *   queryTemplate: `
 *     SELECT * FROM meshcore_adverts 
 *     WHERE {timeColumn:DateTime64} > {lastTimestamp:DateTime64}
 *     ORDER BY {timeColumn:DateTime64} ASC
 *     LIMIT {maxRows:UInt32}
 *   `,
 *   timeColumn: 'ingest_timestamp',
 *   pollInterval: 2000,
 *   maxRowsPerPoll: 500
 * };
 * 
 * const streamer = createClickHouseStreamer(config);
 * 
 * // Use in an async generator
 * async function* pollForNewRows() {
 *   for await (const result of streamer({})) {
 *     console.log(`Found ${result.rowCount} new rows`);
 *     yield result.rows;
 *   }
 * }
 * ```
 */
export function createClickHouseStreamer<T = any>(config: StreamingConfig) {
  const {
    queryTemplate,
    timeColumn,
    pollInterval = 1000,
    maxRowsPerPoll = 1000,
    additionalWhereClause,
    skipInitialMessages = false
  } = config;

  return async function* streamer(params: StreamingParams = {}): AsyncGenerator<StreamingResult<T>, void, unknown> {
    let lastTimestamp: string | null = null;
    let isFirstPoll = true;

    while (true) {
      try {
        // Build the query parameters
        const queryParams: Record<string, any> = {
          maxRows: maxRowsPerPoll,
          lastTimestamp: lastTimestamp || '1970-01-01 00:00:00',
          ...params
        };

        // Build the final query
        let finalQuery = queryTemplate;
        
        // Add additional WHERE clause if provided
        if (additionalWhereClause) {
          // Insert additional WHERE clause before ORDER BY
          const orderByIndex = finalQuery.toUpperCase().indexOf('ORDER BY');
          if (orderByIndex !== -1) {
            finalQuery = finalQuery.slice(0, orderByIndex) + 
                        ` AND ${additionalWhereClause} ` + 
                        finalQuery.slice(orderByIndex);
          } else {
            // If no ORDER BY, add at the end before LIMIT
            const limitIndex = finalQuery.toUpperCase().indexOf('LIMIT');
            if (limitIndex !== -1) {
              finalQuery = finalQuery.slice(0, limitIndex) + 
                          ` AND ${additionalWhereClause} ` + 
                          finalQuery.slice(limitIndex);
            } else {
              finalQuery += ` AND ${additionalWhereClause}`;
            }
          }
        }

        // Execute the query
        const resultSet = await clickhouse.query({
          query: finalQuery,
          query_params: queryParams,
          format: 'JSONEachRow'
        });

        const rows = await resultSet.json() as T[];

        // Only yield if we have new rows
        if (rows.length > 0) {
          // Update timestamp from the latest row (first in DESC order)
          if (rows[0] && typeof rows[0] === 'object' && timeColumn in rows[0]) {
            lastTimestamp = (rows[0] as any)[timeColumn];
          }

          rows.reverse();

          // Skip initial messages if configured
          if (skipInitialMessages && isFirstPoll) {
            console.log(`Skipping ${rows.length} initial messages`);
            isFirstPoll = false;
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            continue;
          }

          // Yield separate events for each row
          for (const row of rows) {
            yield {
              row,
              lastTimestamp: lastTimestamp || '1970-01-01 00:00:00'
            };
          }
        }

        isFirstPoll = false;

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));

      } catch (error) {
        console.error('Error in ClickHouse streaming poll:', error);
        
        // Yield error result
        yield {
          row: {} as T, // Empty row for error case
          lastTimestamp: lastTimestamp || '1970-01-01 00:00:00',
          error: error instanceof Error ? error.message : 'Unknown error'
        } as StreamingResult<T> & { error: string };

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      }
    }
  };
}

/**
 * Helper function to create a streaming configuration for meshcore adverts
 */
export function createMeshcoreAdvertsStreamerConfig(
  region?: string,
  additionalFilters?: Record<string, any>
): StreamingConfig {
  let additionalWhereClause = '';
  
  if (region) {
    // Add region filtering based on broker and topic
    additionalWhereClause = generateRegionConditionForStreaming(region);
  }

  // Add any additional filters
  if (additionalFilters) {
    const filterClauses = Object.entries(additionalFilters).map(([key, value]) => {
      if (Array.isArray(value)) {
        return `${key} IN {${key}:Array(String)}`;
      } else if (typeof value === 'string') {
        return `${key} = {${key}:String}`;
      } else if (typeof value === 'number') {
        return `${key} = {${key}:${Number.isInteger(value) ? 'Int64' : 'Float64'}}`;
      } else if (typeof value === 'boolean') {
        return `${key} = {${key}:UInt8}`;
      }
      return '';
    }).filter(Boolean);

    if (filterClauses.length > 0) {
      additionalWhereClause += (additionalWhereClause ? ' AND ' : '') + filterClauses.join(' AND ');
    }
  }

  return {
    queryTemplate: `
      SELECT 
        public_key,
        node_name,
        latitude,
        longitude,
        has_location,
        is_repeater,
        is_chat_node,
        is_room_server,
        has_name,
        broker,
        topic,
        ingest_timestamp,
        mesh_timestamp,
        adv_timestamp
      FROM meshcore_adverts 
      WHERE ingest_timestamp > {lastTimestamp:DateTime64}
      ORDER BY ingest_timestamp DESC
      LIMIT {maxRows:UInt32}
    `,
    timeColumn: 'ingest_timestamp',
    pollInterval: 2000,
    maxRowsPerPoll: 1000,
    additionalWhereClause: additionalWhereClause || undefined
  };
}

/**
 * Helper function to create a streaming configuration for chat messages
 */
export function createChatMessagesStreamerConfig(
  channelId?: string,
  region?: string
): StreamingConfig {
  let additionalWhereClause = '';
  
  if (channelId) {
    additionalWhereClause = `channel_hash = {channelId:String}`;
  }

  if (region) {
    // Add region filtering for chat messages using origin_path_info
    const regionClause = generateRegionArrayConditionForStreaming(region);
    if (regionClause) {
      additionalWhereClause += (additionalWhereClause ? ' AND ' : '') + regionClause;
    }
  }

  return {
    queryTemplate: `
      SELECT 
        ingest_timestamp,
        mesh_timestamp,
        channel_hash,
        mac,
        hex(encrypted_message) AS encrypted_message,
        message_count,
        origin_path_info,
        message_id
      FROM meshcore_public_channel_messages 
      WHERE ingest_timestamp > {lastTimestamp:DateTime64}
      ORDER BY ingest_timestamp DESC
      LIMIT {maxRows:UInt32}
    `,
    timeColumn: 'ingest_timestamp',
    pollInterval: 250,
    maxRowsPerPoll: 50,
    additionalWhereClause: additionalWhereClause || undefined
  };
}

/**
 * Helper function to create a streaming configuration for meshcore packets
 */
export function createMeshcorePacketsStreamerConfig(
  region?: string,
  payloadType?: number,
  routeType?: number,
  originPubkey?: string
): StreamingConfig {
  let additionalWhereClause = '';
  
  if (region) {
    // Add region filtering based on broker and topic
    const regionClause = generateRegionConditionForStreaming(region);
    if (regionClause) {
      additionalWhereClause = regionClause;
    }
  }

  // Add payload type filter if specified
  if (payloadType !== undefined) {
    const payloadTypeClause = `payload_type = {payloadType:UInt8}`;
    additionalWhereClause += (additionalWhereClause ? ' AND ' : '') + payloadTypeClause;
  }

  // Add route type filter if specified
  if (routeType !== undefined) {
    const routeTypeClause = `route_type = {routeType:UInt8}`;
    additionalWhereClause += (additionalWhereClause ? ' AND ' : '') + routeTypeClause;
  }

  // Add origin pubkey filter if specified
  if (originPubkey) {
    const originClause = `hex(origin_pubkey) = {originPubkey:String}`;
    additionalWhereClause += (additionalWhereClause ? ' AND ' : '') + originClause;
  }

  return {
    queryTemplate: `
      SELECT 
        ingest_timestamp,
        mesh_timestamp,
        broker,
        topic,
        hex(packet) AS packet,
        path_len,
        hex(path) AS path,
        route_type,
        payload_type,
        payload_version,
        header,
        hex(origin_pubkey) AS origin_pubkey
      FROM meshcore_packets 
      WHERE ingest_timestamp > {lastTimestamp:DateTime64}
      ORDER BY ingest_timestamp DESC
      LIMIT {maxRows:UInt32}
    `,
    timeColumn: 'ingest_timestamp',
    pollInterval: 500, // More frequent polling for packets
    maxRowsPerPoll: 50, // Limit rows per poll for packets
    additionalWhereClause: additionalWhereClause || undefined
  };
}
