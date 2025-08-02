"use client";
import { useState, useEffect, useCallback } from "react";
import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useConfig } from "./ConfigContext";
import { decryptMeshcoreGroupMessage } from "../lib/meshcore";
import { getChannelIdFromKey } from "../lib/meshcore";
import ChatMessageItem, { ChatMessage } from "./ChatMessageItem";
import RefreshButton from "./RefreshButton";
import { buildApiUrl } from "../lib/api";

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

interface ChatBoxProps {
  showAllMessagesTab?: boolean;
  className?: string;
  startExpanded?: boolean; // New prop to control initial expanded state
}

interface TabItem {
  channelName: string;
  privateKey: string;
  isAllMessages?: boolean;
}

export default function ChatBox({ showAllMessagesTab = false, className = "", startExpanded = false }: ChatBoxProps) {
  const { config } = useConfig();
  const meshcoreKeys: TabItem[] = [
    { channelName: "Public", privateKey: "izOH6cXN6mrJ5e26oRXNcg==" },
    ...(config?.meshcoreKeys || [])
  ];
  
  // Add "All Messages" tab if requested
  const allTabs: TabItem[] = showAllMessagesTab 
    ? [{ channelName: "All Messages", privateKey: "", isAllMessages: true }, ...meshcoreKeys]
    : meshcoreKeys;
    
  const [selectedTab, setSelectedTab] = useState(showAllMessagesTab ? 1 : 0);
  const [minimized, setMinimized] = useState(!startExpanded); // Use startExpanded as default for minimized state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastBefore, setLastBefore] = useState<string | undefined>(undefined);

  const selectedKey = allTabs[selectedTab];
  const channelId = selectedKey.isAllMessages ? undefined : getChannelIdFromKey(selectedKey.privateKey).toUpperCase();

  // Only show tabs if more than one channel (or if we have all messages tab)
  const showTabs = allTabs.length > 1;

  const fetchMessages = useCallback(async (before?: string, replace = false, after?: string) => {
    setLoading(true);
    try {
      let url = `/api/chat?limit=${PAGE_SIZE}`;
      if (channelId) url += `&channel_id=${channelId}`;
      
      if (after) {
        // Fetch newer messages using the after parameter
        url += `&after=${encodeURIComponent(after)}`;
      } else if (before) {
        // Fetch older messages using before parameter
        url += `&before=${encodeURIComponent(before)}`;
      }
      
      const res = await fetch(buildApiUrl(url));
      const data = await res.json();
      if (Array.isArray(data)) {
        if (after) {
          // Add newer messages to the beginning (most recent first)
          if (data.length > 0) {
            setMessages((prev) => [...data, ...prev]);
          }
        } else {
          setMessages((prev) => replace ? data : [...prev, ...data]);
          setHasMore(data.length === PAGE_SIZE);
          if (data.length > 0) {
            setLastBefore(data[data.length - 1].ingest_timestamp);
          }
        }
      } else {
        // Only set hasMore to false if this is not an auto-refresh request
        if (!after) {
          setHasMore(false);
        }
      }
    } catch (error) {
      // Only set hasMore to false if we don't have a lastBefore value (can't load more)
      if (!lastBefore) {
        setHasMore(false);
      }
      if (after) {
        // Silently fail for auto-refresh
        console.error('Auto-refresh failed:', error);
      }
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    if (!minimized) {
      setMessages([]);
      setHasMore(true);
      setLastBefore(undefined);
      fetchMessages(undefined, true);
    }
  }, [minimized, selectedTab]);

  // Auto-refresh effect
  useEffect(() => {
    if (!minimized && messages.length > 0) {
      const interval = setInterval(() => {
        // Auto-refresh should only fetch newer messages, not replace all
        // Pass the most recent timestamp directly to avoid ref issues
        const mostRecentTimestamp = messages[0].ingest_timestamp;
        fetchMessages(undefined, false, mostRecentTimestamp);
      }, 5000);
      
      return () => clearInterval(interval);
    }
  }, [minimized, channelId, messages]);

  const handleLoadMore = () => {
    if (lastBefore) {
      fetchMessages(lastBefore);
    }
  };

  const handleRefresh = () => {
    setMessages([]);
    setHasMore(true);
    setLastBefore(undefined);
    fetchMessages(undefined, true);
  };

  const LoadMoreButton = () => (
<button
                  className={`w-full py-2 bg-gray-100 dark:bg-neutral-800 rounded text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-neutral-700 ${startExpanded ? "" : "mt-2"}`}
                  onClick={handleLoadMore}
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Load more"}
                </button>
  );

  return (
    <div
      className={`bg-white dark:bg-neutral-900 rounded-lg shadow-lg flex flex-col ${
        startExpanded 
          ? className 
          : minimized 
            ? "w-80 h-10 px-3 py-1" 
            : "w-80 h-96 px-4 py-4"
      }`}
    >
      <div className={`flex items-center justify-between ${startExpanded ? "px-4 py-2 border-b border-gray-200 dark:border-neutral-800" : ""}`} style={startExpanded ? {} : { minHeight: minimized ? '2rem' : '2rem' }}>
        <span className="font-semibold text-gray-800 dark:text-gray-100">MeshCore Chat</span>
        <div className="flex items-center gap-2">
          {(!minimized) && (
            <RefreshButton
              onClick={handleRefresh}
              loading={loading}
              small={true}
              title="Refresh chat messages"
              ariaLabel="Refresh chat messages"
            />
          )}
          {!startExpanded && (
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
          )}
        </div>
      </div>
      
      {(!minimized) && (
        <>
          {showTabs && (
            <div className={`border-b border-gray-200 dark:border-neutral-800 ${startExpanded ? "px-4 py-2" : "mb-2"}`}>
              <div className="flex gap-1 overflow-x-auto scrollbar-hide">
                {allTabs.map((key, idx) => (
                  <button
                    key={key.privateKey + idx}
                    className={`px-2 py-1 text-xs rounded-t font-mono whitespace-nowrap flex-shrink-0 ${
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
            </div>
          )}
          
          <div className={`flex-1 overflow-y-auto text-sm text-gray-700 dark:text-gray-200 ${startExpanded ? "" : "flex flex-col-reverse"}`}>
            <div className={`${startExpanded ? "flex flex-col gap-2 p-4" : "flex flex-col gap-2"}`}>
              {messages.length === 0 && !loading && (
                <div className={`text-gray-400 text-center ${startExpanded ? "py-8" : "mt-8"}`}>No chat messages found.</div>
              )}
              {hasMore && !startExpanded && (
                <LoadMoreButton />
              )}
              {(startExpanded ? messages : messages.toReversed()).map((msg, i) => (
                <ChatMessageItem 
                  key={msg.ingest_timestamp + (msg.origins?.join(',') ?? '') + i} 
                  msg={msg} 
                  showErrorRow={selectedKey.isAllMessages}
                />
              ))}
              {hasMore && startExpanded && (
                <LoadMoreButton />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
} 