"use client";
import React, { useMemo } from "react";
import { useConfig } from "./ConfigContext";
import { useMessageDecryption } from "@/hooks/useMessageDecryption";
import PathVisualization from "./PathVisualization";
import { PathData } from "@/lib/pathUtils";
import NodeLinkWithHover from "./NodeLinkWithHover";
import { findNodeMentions } from "@/lib/node-utils";

export interface ChatMessage {
  message_id: string;
  ingest_timestamp: string;
  origins: string[];
  mesh_timestamp: string;
  path_len: number;
  channel_hash: string;
  mac: string;
  encrypted_message: string;
  message_count: number;
  origin_path_info: Array<[string, string, string, string, string]>; // Array of [origin, origin_pubkey, path, broker, topic] tuples
}


function formatHex(hex: string): string {
  return hex.replace(/(.{2})/g, "$1 ").trim();
}

function formatLocalTime(utcString: string): string {
  const utcDate = new Date(utcString + (utcString.endsWith('Z') ? '' : 'Z'));
  return utcDate.toLocaleString();
}

function ChatMessageContent({ text }: { text: string }) {
  // Use utility function to find node mentions
  const nodeMentions = findNodeMentions(text);
  
  // If no node mentions, handle only URLs
  if (nodeMentions.length === 0) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return (
      <>
        {parts.map((part, index) => {
          // Check if it's a URL
          if (/^https?:\/\//.test(part)) {
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
        })}
      </>
    );
  }

  // Process text with both URLs and node mentions
  const combinedRegex = /(https?:\/\/[^\s]+|@\[[^\]]+\])/g;
  const parts = text.split(combinedRegex);
  
  return (
    <>
      {parts.map((part, index) => {
        // Check if it's a URL
        if (/^https?:\/\//.test(part)) {
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
        
        // Check if it's a node mention @[node_name]
        if (/^@\[.+\]$/.test(part)) {
          const nodeName = part.slice(2, -1); // Remove @[ and ]
          return (
            <NodeLinkWithHover 
              key={index}
              nodeName={nodeName}
              exact={true}
            >
              @{nodeName}
            </NodeLinkWithHover>
          );
        }
        
        // Regular text
        return part;
      })}
    </>
  );
}

function ChatMessageItem({ msg, showErrorRow }: { msg: ChatMessage, showErrorRow?: boolean }) {
  const { config } = useConfig();
  const knownKeys = useMemo(() => [
    ...(config?.meshcoreKeys?.map((k: any) => k.privateKey) || []),
    "izOH6cXN6mrJ5e26oRXNcg==", // Always include public key
  ], [config?.meshcoreKeys]);

  const { data: decryptionResult, isLoading } = useMessageDecryption({
    encrypted_message: msg.encrypted_message,
    mac: msg.mac,
    channel_hash: msg.channel_hash,
    knownKeys,
    parse: true,
  });

  const parsed = decryptionResult?.decrypted || null;
  const error = decryptionResult?.error || null;

  const originPathInfo = useMemo(() => 
    msg.origin_path_info && msg.origin_path_info.length > 0 ? msg.origin_path_info : [],
    [msg.origin_path_info]
  );

  // Convert to PathData format for the new component
  const pathData: PathData[] = useMemo(() => 
    originPathInfo.map(([origin, origin_pubkey, path, broker, topic]) => ({
      origin,
      pubkey: origin_pubkey,
      path
    })),
    [originPathInfo]
  );


  if (parsed) {
    return (
      <div className="border-b border-gray-200 dark:border-neutral-800 pb-2 mb-2">
        <div className="text-xs text-gray-400 flex items-center gap-2">
          {formatLocalTime(new Date(parsed.timestamp * 1000).toISOString())}
          <span className="text-xs text-gray-500">type: {parsed.msgType}</span>
          <span className="text-xs text-gray-500 ml-2">channel: {msg.channel_hash}</span>
        </div>
        <div className="break-words whitespace-pre-wrap">
          {parsed.sender ? (
            <NodeLinkWithHover 
              nodeName={parsed.sender}
              exact={true}
            >
              {parsed.sender}
            </NodeLinkWithHover>
          ) : null}
          {parsed.sender && ": "}
          <ChatMessageContent text={parsed.text} />
        </div>
        <PathVisualization 
          paths={pathData} 
          title={`Heard ${pathData.length} repeat${pathData.length !== 1 ? 's' : ''}`}
          className="text-xs"
          packetHash={msg.message_id}
        />
      </div>
    );
  }

  if (error) {
    if (showErrorRow) {
      return (
        <div className="border-b border-red-200 dark:border-red-800 pb-2 mb-2 bg-red-50 dark:bg-red-900/30">
          <div className="text-xs text-gray-400 flex items-center gap-2">
            {formatLocalTime(msg.ingest_timestamp)}
            <span className="text-xs text-gray-500 ml-2">channel: {msg.channel_hash}</span>
          </div>
          <div className="text-xs text-red-600 dark:text-red-300">
            {error}
          </div>
          <PathVisualization 
            paths={pathData} 
            title={`Heard ${pathData.length} repeat${pathData.length !== 1 ? 's' : ''}`}
            className="text-xs"
            packetHash={msg.message_id}
          />
        </div>
      );
    } else {
      return <></>;
    }
  }

  if (isLoading) {
    return (
      <div className="border-b border-gray-200 dark:border-neutral-800 pb-2 mb-2">
        <div className="text-xs text-gray-400 flex items-center gap-2">
          {formatLocalTime(msg.ingest_timestamp)}
          <span className="text-xs text-gray-500 ml-2">channel: {msg.channel_hash}</span>
        </div>
        <div className="w-full h-5 bg-gray-200 dark:bg-neutral-800 rounded animate-pulse my-2" />
        <PathVisualization 
          paths={pathData} 
          title={`Heard ${pathData.length} repeat${pathData.length !== 1 ? 's' : ''}`}
          className="text-xs"
          packetHash={msg.message_id}
        />
      </div>
    );
  }

  return null; // This should not be reached now, but kept for safety
}

export default React.memo(ChatMessageItem, (prevProps, nextProps) => {
  // Only re-render if these key properties change
  return (
    prevProps.msg.message_id === nextProps.msg.message_id &&
    prevProps.msg.ingest_timestamp === nextProps.msg.ingest_timestamp &&
    prevProps.msg.encrypted_message === nextProps.msg.encrypted_message &&
    prevProps.msg.mac === nextProps.msg.mac &&
    prevProps.msg.channel_hash === nextProps.msg.channel_hash &&
    prevProps.msg.origin_path_info?.length === nextProps.msg.origin_path_info?.length &&
    prevProps.showErrorRow === nextProps.showErrorRow
  );
}); 