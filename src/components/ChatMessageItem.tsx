"use client";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useConfig } from "./ConfigContext";
import { decryptMeshcoreGroupMessage } from "../lib/meshcore";
import PathVisualization, { PathData } from "./PathVisualization";
import NodeLinkWithHover from "./NodeLinkWithHover";

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

  // Convert to PathData format for the new component
  const pathData: PathData[] = useMemo(() => 
    originKeyPathArray.map(([origin, pubkey, path]) => ({
      origin,
      pubkey,
      path
    })),
    [originKeyPathArray]
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
            >
              {parsed.sender}
            </NodeLinkWithHover>
          ) : null}
          {parsed.sender && ": "}
          <span>{linkifyText(parsed.text)}</span>
        </div>
        <PathVisualization 
          paths={pathData} 
          title={`Heard ${pathData.length} repeat${pathData.length !== 1 ? 's' : ''}`}
          className="text-xs"
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
          />
        </div>
      );
    } else {
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
      <PathVisualization 
        paths={pathData} 
        title={`Heard ${pathData.length} repeat${pathData.length !== 1 ? 's' : ''}`}
        className="text-xs"
      />
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