"use client";
import { useState, useEffect } from "react";
import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useConfig } from "./ConfigContext";
import { decryptMeshcoreGroupMessage } from "../lib/meshcore_decrypt";
import { getChannelIdFromKey } from "../lib/meshcore";
import ChatMessageItem, { ChatMessage } from "./ChatMessageItem";

const PAGE_SIZE = 20;

function formatHex(hex: string): string {
  // Add a space every 2 characters for readability
  return hex.replace(/(.{2})/g, "$1 ").trim();
}

function formatLocalTime(utcString: string): string {
  // Parse as UTC and display in local time
  const utcDate = new Date(utcString + (utcString.endsWith('Z') ? '' : 'Z'));
  return utcDate.toLocaleString();
}

export default function ChatBox() {
  const { config } = useConfig();
  const meshcoreKeys = [
    { channelName: "Public", privateKey: "izOH6cXN6mrJ5e26oRXNcg==" },
    ...(config?.meshcoreKeys || [])
  ];
  const [selectedTab, setSelectedTab] = useState(0);
  const [minimized, setMinimized] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastBefore, setLastBefore] = useState<string | undefined>(undefined);

  const selectedKey = meshcoreKeys[selectedTab];
  const channelId = getChannelIdFromKey(selectedKey.privateKey).toUpperCase();

  // Only show tabs if more than one channel (public + at least one custom key)
  const showTabs = meshcoreKeys.length > 1;

  useEffect(() => {
    if (!minimized) {
      setMessages([]);
      setHasMore(true);
      setLastBefore(undefined);
      fetchMessages(undefined, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minimized, selectedTab]);

  const fetchMessages = async (before?: string, replace = false) => {
    setLoading(true);
    try {
      let url = `/api/chat?limit=${PAGE_SIZE}&channel_id=${channelId}`;
      if (before) url += `&before=${encodeURIComponent(before)}`;
      const res = await fetch(url);
      const data = await res.json();
      if (Array.isArray(data)) {
        setMessages((prev) => replace ? data : [...prev, ...data]);
        setHasMore(data.length === PAGE_SIZE);
        if (data.length > 0) {
          setLastBefore(data[data.length - 1].ingest_timestamp);
        }
      } else {
        setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (lastBefore) {
      fetchMessages(lastBefore);
    }
  };

  return (
    <div
      className={`w-80 bg-white dark:bg-neutral-900 rounded-lg shadow-lg flex flex-col ${
        minimized ? "min-h-[2.5rem] px-4 py-2" : "h-96 px-4 py-4"
      }`}
    >
      <div className="flex items-center justify-between" style={{ minHeight: '2rem' }}>
        <span className="font-semibold text-gray-800 dark:text-gray-100">MeshCore Chat</span>
        <button
          className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-800"
          onClick={() => setMinimized((m) => !m)}
          aria-label={minimized ? "Maximize MeshCore Chat" : "Minimize MeshCore Chat"}
        >
          {minimized ? (
            <PlusIcon className="h-5 w-5" />
          ) : (
            <MinusIcon className="h-5 w-5" />
          )}
        </button>
      </div>
      {!minimized && (
        <>
          {showTabs && (
            <div className="flex gap-1 mb-2 border-b border-gray-200 dark:border-neutral-800">
              {meshcoreKeys.map((key, idx) => (
                <button
                  key={key.privateKey + idx}
                  className={`px-2 py-1 text-xs rounded-t font-mono ${
                    idx === selectedTab
                      ? "bg-gray-100 dark:bg-neutral-800 text-blue-700 dark:text-blue-400 border-b-2 border-blue-500"
                      : "bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800"
                  }`}
                  onClick={() => setSelectedTab(idx)}
                >
                  {key.channelName || getChannelIdFromKey(key.privateKey).toUpperCase()}
                </button>
              ))}
            </div>
          )}
          <div className="flex-1 overflow-y-auto text-sm text-gray-700 dark:text-gray-200 flex flex-col-reverse">
            <div className="flex flex-col-reverse gap-2">
              {messages.length === 0 && !loading && (
                <div className="text-gray-400 text-center mt-8">No chat messages found.</div>
              )}
              {messages.map((msg, i) => (
                <ChatMessageItem key={msg.ingest_timestamp + msg.origin + i} msg={msg} />
              ))}
              {hasMore && (
                <button
                  className="w-full py-2 bg-gray-100 dark:bg-neutral-800 rounded text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-neutral-700 mt-2"
                  onClick={handleLoadMore}
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Load more"}
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
} 