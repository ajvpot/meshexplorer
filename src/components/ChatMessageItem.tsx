"use client";
import { useState, useEffect } from "react";
import { useConfig } from "./ConfigContext";
import { decryptMeshcoreGroupMessage } from "../lib/meshcore";

export interface ChatMessage {
  ingest_timestamp: string;
  origins: string[];
  mesh_timestamp: string;
  packet: string;
  path_len: number;
  path: string;
  channel_hash: string;
  mac: string;
  encrypted_message: string;
}

function formatHex(hex: string): string {
  return hex.replace(/(.{2})/g, "$1 ").trim();
}

function formatLocalTime(utcString: string): string {
  const utcDate = new Date(utcString + (utcString.endsWith('Z') ? '' : 'Z'));
  return utcDate.toLocaleString();
}

export default function ChatMessageItem({ msg, showErrorRow }: { msg: ChatMessage, showErrorRow?: boolean }) {
  const { config } = useConfig();
  const knownKeys = [
    ...(config?.meshcoreKeys?.map((k: any) => k.privateKey) || []),
    "izOH6cXN6mrJ5e26oRXNcg==", // Always include public key
  ];
  const [parsed, setParsed] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [originsExpanded, setOriginsExpanded] = useState(false);

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
  }, [msg.encrypted_message, msg.mac, msg.channel_hash, knownKeys.join(",")]);

  const origins = msg.origins && msg.origins.length > 0 ? msg.origins : [];
  const originsCount = origins.length;

  const OriginsBox = () => (
    <div className="text-xs text-gray-300">
      <button
        onClick={() => setOriginsExpanded(!originsExpanded)}
        className="flex items-center gap-1 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
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
      {originsExpanded && originsCount > 0 && (
        <div className="mt-1 p-2 bg-gray-100 dark:bg-neutral-700 rounded text-xs break-all">
          {origins.map((origin, index) => (
            <div key={index} className="font-mono">
              {origin}
            </div>
          ))}
        </div>
      )}
    </div>
  );

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
          <span>{parsed.text}</span>
        </div>
        <OriginsBox />
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
    </div>
  );
} 