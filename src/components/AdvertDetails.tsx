"use client";

import { useState } from "react";
import moment from "moment";
import PathVisualization, { PathData } from "./PathVisualization";

interface AdvertDetailsProps {
  advert: {
    group_id: number;
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
  };
  initiatingNodeKey?: string;
}

export default function AdvertDetails({ advert, initiatingNodeKey }: AdvertDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const timeRange = advert.earliest_timestamp !== advert.latest_timestamp 
    ? `to ${moment.utc(advert.latest_timestamp).format('HH:mm:ss')}` : '';

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
      {/* Header - Always visible */}
      <div 
        className="px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
              {moment.utc(advert.earliest_timestamp).format('MM-DD HH:mm:ss')}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {timeRange}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Heard {advert.advert_count} time{advert.advert_count !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex space-x-1">
              {advert.is_repeater && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  R
                </span>
              ) || null}
              {advert.is_chat_node && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  C
                </span>
              ) || null}
              {advert.is_room_server && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                  S
                </span>
              ) || null}
            </div>
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Expandable content */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-gray-200 dark:border-gray-700">
          <div className="pt-4 space-y-4">
            {/* Path details */}
            <div>
              <PathVisualization 
                paths={advert.origin_path_pubkey_tuples.map(([origin, path, origin_pubkey], index) => ({
                  origin: origin || origin_pubkey.substring(0, 8), // Use origin name if available, fallback to pubkey
                  pubkey: origin_pubkey,
                  path: path
                }))}
                className="text-sm"
                initiatingNodeKey={initiatingNodeKey}
                packetHash={advert.packet_hash}
              />
            </div>

            {/* Location details */}
            {advert.has_location && advert.latitude && advert.longitude && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                  Location
                </h4>
                <div className="text-sm text-gray-600 dark:text-gray-300">
                  {advert.latitude.toFixed(6)}, {advert.longitude.toFixed(6)}
                </div>
              </div>
            )}

            {/* Timestamp details */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Timestamps
              </h4>
              <div className="text-sm text-gray-600 dark:text-gray-300 space-y-1">
                <div>
                  <span className="font-medium">Earliest:</span> {moment.utc(advert.earliest_timestamp).format('YYYY-MM-DD HH:mm:ss')} UTC
                </div>
                <div>
                  <span className="font-medium">Latest:</span> {moment.utc(advert.latest_timestamp).format('YYYY-MM-DD HH:mm:ss')} UTC
                </div>
                {advert.earliest_timestamp !== advert.latest_timestamp && (
                  <div>
                    <span className="font-medium">Duration:</span> {moment.utc(advert.latest_timestamp).diff(moment.utc(advert.earliest_timestamp), 'seconds')} seconds
                  </div>
                )}
              </div>
            </div>

            {/* Node capabilities */}
            <div>
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                Node Capabilities
              </h4>
              <div className="flex flex-wrap gap-2">
                {advert.is_repeater && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Repeater
                  </span>
                ) || null}
                {advert.is_chat_node && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Companion
                  </span>
                ) || null}
                {advert.is_room_server && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                    Room Server
                  </span>
                ) || null}
                {!advert.is_repeater && !advert.is_chat_node && !advert.is_room_server && (
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    Unknown
                  </span>
                ) || null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
