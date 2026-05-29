"use client";

import { useState } from "react";
import moment from "moment";
import PathVisualization from "./PathVisualization";
import { PathData } from "@/lib/pathUtils";
import type { Advert } from "@/gen/meshexplorer/v1/node_pb";

interface AdvertDetailsProps {
  advert: Advert;
  initiatingNodeKey?: string;
}

export default function AdvertDetails({ advert, initiatingNodeKey }: AdvertDetailsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const timeRange = advert.earliestTimestamp !== advert.latestTimestamp 
    ? `to ${moment.utc(advert.latestTimestamp).format('HH:mm:ss')}` : '';

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
              {moment.utc(advert.earliestTimestamp).format('MM-DD HH:mm:ss')}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {timeRange}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Heard {advert.advertCount} time{advert.advertCount !== 1 ? 's' : ''}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <div className="flex space-x-1">
              {advert.isRepeater && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  R
                </span>
              ) || null}
              {advert.isChatNode && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  C
                </span>
              ) || null}
              {advert.isRoomServer && (
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
                paths={advert.originPathPubkeyTuples.map((t) => ({
                  origin: t.origin || t.originPubkey.substring(0, 8), // Use origin name if available, fallback to pubkey
                  pubkey: t.originPubkey,
                  path: t.path
                }))}
                className="text-sm"
                initiatingNodeKey={initiatingNodeKey}
                packetHash={advert.packetHash}
              />
            </div>

            {/* Location details */}
            {advert.hasLocation && advert.latitude && advert.longitude && (
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
                  <span className="font-medium">Earliest:</span> {moment.utc(advert.earliestTimestamp).format('YYYY-MM-DD HH:mm:ss')} UTC
                </div>
                <div>
                  <span className="font-medium">Latest:</span> {moment.utc(advert.latestTimestamp).format('YYYY-MM-DD HH:mm:ss')} UTC
                </div>
                {advert.earliestTimestamp !== advert.latestTimestamp && (
                  <div>
                    <span className="font-medium">Duration:</span> {moment.utc(advert.latestTimestamp).diff(moment.utc(advert.earliestTimestamp), 'seconds')} seconds
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
                {advert.isRepeater && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                    Repeater
                  </span>
                ) || null}
                {advert.isChatNode && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                    Companion
                  </span>
                ) || null}
                {advert.isRoomServer && (
                  <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                    Room Server
                  </span>
                ) || null}
                {!advert.isRepeater && !advert.isChatNode && !advert.isRoomServer && (
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
