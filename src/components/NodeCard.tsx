"use client";

import { MapPinIcon, WifiIcon, ChatBubbleLeftRightIcon, ServerIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import moment from 'moment';
import { formatPublicKey } from '@/lib/meshcore';
import { MeshcoreSearchResult } from '@/hooks/useMeshcoreSearch';

export interface NodeCardData {
  public_key: string;
  node_name: string | null;
  latitude: number | null;
  longitude: number | null;
  has_location: number;
  is_repeater: number;
  is_chat_node: number;
  is_room_server: number;
  last_seen: string;
  topic?: string;
  broker?: string;
}

interface NodeCardProps {
  node: NodeCardData | MeshcoreSearchResult;
  className?: string;
  showTopicInfo?: boolean;
}

export default function NodeCard({ node, className = "", showTopicInfo = true }: NodeCardProps) {
  const hasLocation = node.has_location === 1;
  const isRepeater = node.is_repeater === 1;
  const isChatNode = node.is_chat_node === 1;
  const isRoomServer = node.is_room_server === 1;

  return (
    <Link
      href={`/meshcore/node/${node.public_key}`}
      className={`block bg-white dark:bg-neutral-800 rounded-lg border border-gray-200 dark:border-neutral-700 p-4 hover:shadow-md dark:hover:shadow-lg transition-shadow ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <h4 className="text-lg font-medium text-gray-900 dark:text-gray-100 truncate">
              {node.node_name || 'Unnamed Node'}
            </h4>
            <div className="flex items-center gap-1">
              {isRepeater && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                  <WifiIcon className="h-3 w-3 mr-1" />
                  Repeater
                </span>
              )}
              {isChatNode && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                  <ChatBubbleLeftRightIcon className="h-3 w-3 mr-1" />
                  Chat
                </span>
              )}
              {isRoomServer && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200">
                  <ServerIcon className="h-3 w-3 mr-1" />
                  Room Server
                </span>
              )}
            </div>
          </div>

          <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
            {hasLocation && node.latitude && node.longitude && (
              <div className="flex items-center gap-1">
                <MapPinIcon className="h-4 w-4" />
                <span>
                  {node.latitude.toFixed(4)}, {node.longitude.toFixed(4)}
                </span>
              </div>
            )}
            
            <div className="flex items-center gap-4">
              <span>Last seen: {moment.utc(node.last_seen).local().fromNow()}</span>
              <span className="text-xs font-mono text-gray-500 dark:text-gray-500">
                {formatPublicKey(node.public_key)}
              </span>
            </div>

            {showTopicInfo && node.topic && node.broker && (
              <div className="text-xs text-gray-500 dark:text-gray-500">
                Topic: {node.topic} • Broker: {node.broker.split('://')[1]}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
