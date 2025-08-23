"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { useConfig } from "./ConfigContext";
import { decryptMeshcoreGroupMessage } from "../lib/meshcore";
import Tree from 'react-d3-tree';
import { ArrowsPointingOutIcon, ArrowsPointingInIcon } from "@heroicons/react/24/outline";

export interface ChatMessage {
  ingest_timestamp: string;
  origins: string[];
  mesh_timestamp: string;
  path_len: number;
  channel_hash: string;
  mac: string;
  encrypted_message: string;
  message_count: number;
  origin_key_path_array: Array<[string, string, string]>; // Array of [origin, pubkey, path] tuples
}

interface PathGroup {
  path: string;
  pathSlices: string[];  // Includes origin pubkey as the final hop
  indices: number[];
}

interface TreeNode {
  name: string;
  children?: TreeNode[];
  attributes?: Record<string, any>;
  [key: string]: any;
}

// Type guard to ensure treeData is valid
const isValidTreeData = (data: TreeNode | null): data is TreeNode => {
  return data !== null && typeof data === 'object' && 'name' in data;
};

function formatHex(hex: string): string {
  return hex.replace(/(.{2})/g, "$1 ").trim();
}

function formatLocalTime(utcString: string): string {
  const utcDate = new Date(utcString + (utcString.endsWith('Z') ? '' : 'Z'));
  return utcDate.toLocaleString();
}

function linkifyText(text: string): React.ReactNode {
  // URL regex pattern to match http/https URLs
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  
  const parts = text.split(urlRegex);
  
  return parts.map((part, index) => {
    if (urlRegex.test(part)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="nofollow noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          {part}
        </a>
      );
    }
    return part;
  });
}

function ChatMessageItem({ msg, showErrorRow }: { msg: ChatMessage, showErrorRow?: boolean }) {
  const { config } = useConfig();
  const knownKeys = useMemo(() => [
    ...(config?.meshcoreKeys?.map((k: any) => k.privateKey) || []),
    "izOH6cXN6mrJ5e26oRXNcg==", // Always include public key
  ], [config?.meshcoreKeys]);
  const knownKeysString = knownKeys.join(",");
  const [parsed, setParsed] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [originsExpanded, setOriginsExpanded] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [graphFullscreen, setGraphFullscreen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await decryptMeshcoreGroupMessage({
          encrypted_message: msg.encrypted_message,
          mac: msg.mac,
          channel_hash: msg.channel_hash,
          knownKeys,
          parse: true,
        });
        if (!cancelled) {
          if (result === null) {
            setParsed(null);
            setError("Could not decrypt message with any known key.");
          } else {
            setParsed(result);
            setError(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          setParsed(null);
          setError(err instanceof Error ? err.message : "Decryption error occurred.");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [msg.encrypted_message, msg.mac, msg.channel_hash, knownKeysString, knownKeys]);

  const originKeyPathArray = useMemo(() => 
    msg.origin_key_path_array && msg.origin_key_path_array.length > 0 ? msg.origin_key_path_array : [],
    [msg.origin_key_path_array]
  );
  const originsCount = originKeyPathArray.length;

  // Process data for tree visualization
  const treeData = useMemo(() => {
    if (!showGraph || originsCount === 0) return null;

    // Group messages by path similarity
    const pathGroups: PathGroup[] = [];
    
    originKeyPathArray.forEach(([origin, pubkey, path], index) => {
      // Parse path into 2-character slices and include pubkey as final hop
      const pathSlices = path.match(/.{1,2}/g) || [];
      const pubkeyPrefix = pubkey.substring(0, 2);
      const fullPathSlices = [...pathSlices, pubkeyPrefix];
      
      // Find existing group with same path structure
      const existingGroup = pathGroups.find(group => 
        group.pathSlices.length === fullPathSlices.length &&
        group.pathSlices.every((slice, i) => slice === fullPathSlices[i])
      );
      
      if (existingGroup) {
        existingGroup.indices.push(index);
      } else {
        pathGroups.push({
          path: path + pubkeyPrefix,
          pathSlices: fullPathSlices,
          indices: [index]
        });
      }
    });

    // Build tree structure for react-d3-tree
    const buildTree = (): TreeNode => {
      const root: TreeNode = { name: "??", children: [] };
      
      pathGroups.forEach(group => {
        let currentNode = root;
        
        group.pathSlices.forEach((slice, level) => {
          let child = currentNode.children?.find(c => c.name === slice);
          
          if (!child) {
            child = { name: slice, children: [] };
            if (!currentNode.children) currentNode.children = [];
            currentNode.children.push(child);
          }
          
          currentNode = child;
        });
      });
      
      return root;
    };

    return buildTree();
  }, [showGraph, originKeyPathArray, originsCount]);

  const handleOriginsToggle = useCallback(() => {
    setOriginsExpanded(prev => !prev);
  }, []);

  const handleGraphToggle = useCallback(() => {
    setShowGraph(prev => !prev);
  }, []);

  const handleFullscreenToggle = useCallback(() => {
    setGraphFullscreen(prev => !prev);
  }, []);

  const OriginsBox = useCallback(() => (
    <div className="text-xs text-gray-600 dark:text-gray-300">
      <div className="flex items-center gap-2">
        <button
          onClick={handleOriginsToggle}
          className="flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
        >
          <span>Heard {originsCount > 0 ? `${originsCount} repeat${originsCount !== 1 ? 's' : ''}` : '0 repeats'}</span>
          <svg
            className={`w-3 h-3 transition-transform ${originsExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {originsCount > 0 && (
          <button
            onClick={handleGraphToggle}
            className="flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
          >
            <span>{showGraph ? 'Hide Graph' : 'Show Graph'}</span>
          </button>
        )}
      </div>
      
      {originsExpanded && originsCount > 0 && (
        <div className="mt-1 p-2 bg-gray-100 dark:bg-neutral-700 rounded text-xs break-all text-gray-800 dark:text-gray-200">
          {/* List view (original) */}
          {originKeyPathArray.map(([origin, pubkey, path], index: number) => {
            // Parse path into 2-character slices
            const pathSlices = path.match(/.{1,2}/g) || [];
            const formattedPath = pathSlices.join(' ');
            // Get first 2 characters of the pubkey
            const pubkeyPrefix = pubkey.substring(0, 2);
            
            return (
              <div key={index} className="flex items-center gap-2">
                <span>{origin}</span>
                <span className="font-mono">{formattedPath}</span>
                <span className="text-blue-600 dark:text-blue-400">({pubkeyPrefix})</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  ), [originsExpanded, originsCount, showGraph, originKeyPathArray, handleOriginsToggle, handleGraphToggle]);

  const GraphView = useCallback(() => {
    if (!showGraph || originsCount === 0 || !treeData) return null;

    const renderTree = () => (
      <Tree
        key={`tree-${msg.ingest_timestamp}-${originsCount}`}
        data={treeData}
        orientation="vertical"
        pathFunc="step"
        translate={{ x: graphFullscreen ? 300 : 200, y: graphFullscreen ? 80 : 50 }}
        separation={{ siblings: 1.2, nonSiblings: 1.5 }}
        nodeSize={{ x: 60, y: 60 }}
        zoomable={true}
        draggable={true}

        renderCustomNodeElement={({ nodeDatum, toggleNode }) => {
          const isRoot = nodeDatum.name === "??";
          // Check if this node represents an origin pubkey (final 2-char hex from pubkey)
          const isOriginPubkey = originKeyPathArray.some(([origin, pubkey, path]) => {
            const pubkeyPrefix = pubkey.substring(0, 2);
            return nodeDatum.name === pubkeyPrefix;
          });
          
          return (
            <g key={`node-${nodeDatum.name}`}>
              <circle 
                r={15} 
                fill={isRoot ? "#3b82f6" : "#6b7280"}
                stroke={isOriginPubkey && !isRoot ? "#10b981" : "none"}
                strokeWidth={isOriginPubkey && !isRoot ? 2 : 0}
              />
              <text
                textAnchor="middle"
                y="5"
                style={{ fontSize: "12px", fill: "white", fontWeight: "bold", stroke: "none" }}
              >
                {nodeDatum.name}
              </text>
            </g>
          );
        }}
      />
    );

    if (graphFullscreen && typeof window !== 'undefined') {
      return createPortal(
        <div 
          key="fullscreen-overlay"
          className="fixed inset-0 z-50 bg-black bg-opacity-75 flex items-center justify-center"
          onClick={handleFullscreenToggle}
        >
          <div 
            className="bg-gray-100 dark:bg-neutral-700 rounded-lg shadow-2xl w-11/12 h-5/6 p-6 text-gray-800 dark:text-gray-200 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <h2 className="text-lg font-semibold">Message Propagation Tree</h2>
              <button
                onClick={handleFullscreenToggle}
                className="p-2 text-sm rounded bg-gray-200 dark:bg-neutral-700 hover:bg-gray-300 dark:hover:bg-neutral-600 transition-colors"
                title="Exit Fullscreen"
              >
                <ArrowsPointingInIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {renderTree()}
            </div>
          </div>
        </div>,
        document.body
      );
    }

          return (
        <div key="graph-container" className="mt-2 p-3 bg-gray-100 dark:bg-neutral-700 rounded text-xs text-gray-800 dark:text-gray-200 relative">
          <button
            onClick={handleFullscreenToggle}
            className="absolute top-2 right-2 p-2 text-xs rounded bg-gray-200 dark:bg-neutral-600 hover:bg-gray-300 dark:hover:bg-neutral-500 transition-colors z-10"
            title="Enter Fullscreen"
          >
            <ArrowsPointingOutIcon className="w-4 h-4" />
          </button>
          <div key="graph-content" className="w-full h-80">
            {renderTree()}
          </div>
        </div>
      );
  }, [showGraph, originsCount, treeData, msg.ingest_timestamp, graphFullscreen, handleFullscreenToggle, originKeyPathArray]);

  if (parsed) {
    return (
      <div className="border-b border-gray-200 dark:border-neutral-800 pb-2 mb-2">
        <div className="text-xs text-gray-400 flex items-center gap-2">
          {formatLocalTime(new Date(parsed.timestamp * 1000).toISOString())}
          <span className="text-xs text-gray-500">type: {parsed.msgType}</span>
          <span className="text-xs text-gray-500 ml-2">channel: {msg.channel_hash}</span>
        </div>
        <div className="break-all whitespace-pre-wrap">
          <span className="font-bold text-blue-800 dark:text-blue-300">{parsed.sender}</span>
          {parsed.sender && ": "}
          <span>{linkifyText(parsed.text)}</span>
        </div>
        <OriginsBox />
        <GraphView />
      </div>
    );
  }

  if  (error) {
    if (showErrorRow) {
    return (
      <div className="border-b border-red-200 dark:border-red-800 pb-2 mb-2 bg-red-50 dark:bg-red-900/30">
        <div className="text-xs text-red-600 dark:text-red-300 flex items-center gap-2">
          Error: {error}
          <span className="text-xs text-gray-500 ml-2">channel: {msg.channel_hash}</span>
        </div>
        <OriginsBox />
        <GraphView />
      </div>
    );
}else{
  return <></>;
}
  }

  return (
    <div className="border-b border-gray-200 dark:border-neutral-800 pb-2 mb-2">
              <div className="text-xs text-gray-400 flex items-center gap-2">
          {formatLocalTime(msg.ingest_timestamp)}
          <span className="text-xs text-gray-500 ml-2">channel: {msg.channel_hash}</span>
        </div>
      <div className="w-full h-5 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse my-2" />
      <OriginsBox />
      <GraphView />
    </div>
  );
}

export default React.memo(ChatMessageItem, (prevProps, nextProps) => {
  // Only re-render if these key properties change
  return (
    prevProps.msg.ingest_timestamp === nextProps.msg.ingest_timestamp &&
    prevProps.msg.encrypted_message === nextProps.msg.encrypted_message &&
    prevProps.msg.mac === nextProps.msg.mac &&
    prevProps.msg.channel_hash === nextProps.msg.channel_hash &&
    prevProps.msg.origin_key_path_array?.length === nextProps.msg.origin_key_path_array?.length &&
    prevProps.showErrorRow === nextProps.showErrorRow
  );
}); 