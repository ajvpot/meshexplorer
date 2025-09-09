import { useQuery } from '@tanstack/react-query';
import { buildApiUrl } from '../lib/api';

export interface NodeInfo {
  public_key: string;
  node_name: string;
  latitude: number | null;
  longitude: number | null;
  has_location: number;
  is_repeater: number;
  is_chat_node: number;
  is_room_server: number;
  has_name: number;
  first_seen: string;
  last_seen: string;
}

export interface Advert {
  group_id: number;
  origin_path_pubkey_tuples: Array<[string, string, string]>; // Array of [origin, path, origin_pubkey] tuples
  advert_count: number;
  earliest_timestamp: string;
  latest_timestamp: string;
  latitude: number | null;
  longitude: number | null;
  is_repeater: number;
  is_chat_node: number;
  is_room_server: number;
  has_location: number;
}

export interface LocationHistory {
  mesh_timestamp: string;
  latitude: number;
  longitude: number;
}

export interface MqttTopic {
  topic: string;
  broker: string;
  last_packet_time: string;
  is_recent: boolean;
}

export interface MqttInfo {
  is_uplinked: boolean;
  has_packets: boolean;
  topics: MqttTopic[];
}

export interface NodeData {
  node: NodeInfo;
  recentAdverts: Advert[];
  locationHistory: LocationHistory[];
  mqtt: MqttInfo;
}

export interface NodeError {
  error: string;
  code: string;
  publicKey?: string;
}

interface UseNodeDataParams {
  publicKey: string | null;
  limit?: number;
  enabled?: boolean;
}

export function useNodeData({ publicKey, limit = 50, enabled = true }: UseNodeDataParams) {
  return useQuery<NodeData, NodeError>({
    queryKey: ['node-data', publicKey, limit],
    queryFn: async (): Promise<NodeData> => {
      if (!publicKey) {
        throw { error: "Public key is required", code: "MISSING_PUBLIC_KEY" } as NodeError;
      }
      
      const params = new URLSearchParams();
      if (limit !== 50) {
        params.append('limit', limit.toString());
      }
      
      const url = `/api/meshcore/node/${publicKey}${params.toString() ? `?${params.toString()}` : ''}`;
      
      const response = await fetch(buildApiUrl(url));
      
      // Handle specific error responses
      if (!response.ok) {
        let errorData: NodeError;
        try {
          errorData = await response.json();
        } catch {
          errorData = { 
            error: `HTTP ${response.status}: ${response.statusText}`,
            code: 'UNKNOWN_ERROR'
          };
        }
        
        // Add status information to error for better handling
        throw {
          ...errorData,
          status: response.status
        } as NodeError & { status: number };
      }
      
      return response.json();
    },
    enabled: enabled && !!publicKey,
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    retry: (failureCount, error) => {
      // Don't retry for client errors (4xx)
      const status = (error as NodeError & { status?: number })?.status;
      if (status && status >= 400 && status < 500) {
        return false;
      }
      // Retry up to 1 time for server errors
      return failureCount < 1;
    },
  });
}
