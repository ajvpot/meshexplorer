"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { useConfig } from "@/components/ConfigContext";
import { decryptMeshcoreGroupMessage } from "@/lib/meshcore_decrypt";
import { getChannelIdFromKey } from "@/lib/meshcore";
import ChatMessageItem, { ChatMessage } from "@/components/ChatMessageItem";
import RefreshButton from "@/components/RefreshButton";

// Messages page: displays all chat messages from all channels with infinite scrolling. If a message cannot be decrypted, shows a row explaining the reason.

const PAGE_SIZE = 40;

function formatLocalTime(utcString: string): string {
  const utcDate = new Date(utcString + (utcString.endsWith('Z') ? '' : 'Z'));
  return utcDate.toLocaleString();
}

export default function MessagesPage() {
  const { config } = useConfig();
  const meshcoreKeys = useMemo(() => [
    "izOH6cXN6mrJ5e26oRXNcg==", // Public key always included
    ...(config?.meshcoreKeys?.map((k: any) => k.privateKey) || [])
  ], [config]);

  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lastBefore, setLastBefore] = useState<string | undefined>(undefined);
  const [autoRefreshing, setAutoRefreshing] = useState(false);
  const autoRefreshTimeout = useRef<NodeJS.Timeout | null>(null);

  // Infinite scroll
  useEffect(() => {
    const onScroll = () => {
      if (
        window.innerHeight + window.scrollY >= document.body.offsetHeight - 300 &&
        !loading && hasMore
      ) {
        fetchMessages(lastBefore);
      }
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
    // eslint-disable-next-line
  }, [loading, hasMore, lastBefore]);

  useEffect(() => {
    setMessages([]);
    setHasMore(true);
    setLastBefore(undefined);
    fetchMessages(undefined, true);
    // eslint-disable-next-line
  }, [meshcoreKeys.join(",")]);

  // Poll for new messages every 10s
  useEffect(() => {
    const interval = setInterval(async () => {
      if (messages.length === 0) return;
      const latest = messages[0]?.ingest_timestamp;
      if (!latest) return;
      try {
        setAutoRefreshing(true);
        let url = `/api/chat?limit=${PAGE_SIZE}&after=${encodeURIComponent(latest)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          // Only prepend messages that are not already present
          const existingKeys = new Set(messages.map((m) => m.ingest_timestamp + m.origin));
          const newMessages = data.filter((msg: any) => !existingKeys.has(msg.ingest_timestamp + msg.origin));
          if (newMessages.length > 0) {
            setMessages((prev) => [...newMessages, ...prev]);
          }
        }
      } catch {}
      // Show auto-refresh spinner for 1s
      if (autoRefreshTimeout.current) clearTimeout(autoRefreshTimeout.current);
      autoRefreshTimeout.current = setTimeout(() => setAutoRefreshing(false), 1000);
    }, 10000);
    return () => {
      clearInterval(interval);
      if (autoRefreshTimeout.current) clearTimeout(autoRefreshTimeout.current);
    };
  }, [messages]);

  const fetchMessages = async (before?: string, replace = false) => {
    setLoading(true);
    try {
      let url = `/api/chat?limit=${PAGE_SIZE}`;
      if (before) url += `&before=${encodeURIComponent(before)}`;
      // No channel_id: fetch all channels
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

  return (
    <div className="max-w-2xl mx-auto py-8 px-4" style={{ position: 'relative' }}>
      {/* Header row with title and refresh button */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">All Messages</h1>
        <RefreshButton
          onClick={() => fetchMessages(undefined, true)}
          loading={loading}
          autoRefreshing={autoRefreshing}
          title={autoRefreshing ? "Auto-refreshing..." : "Refresh messages"}
          ariaLabel="Refresh messages"
          small
        />
      </div>
      {/* Add keyframes for spin animation */}
      <style>{`
        @keyframes spin {
          100% { transform: rotate(360deg); }
        }
      `}</style>
      <div className="flex flex-col gap-0 border rounded-lg bg-white dark:bg-neutral-900 shadow divide-y divide-gray-200 dark:divide-neutral-800">
        {messages.length === 0 && !loading && (
          <div className="text-gray-400 text-center py-8">No chat messages found.</div>
        )}
        {messages.map((msg, i) => (
          <ChatMessageItem key={msg.ingest_timestamp + msg.origin + i} msg={msg} showErrorRow showChannelId={true} />
        ))}
        {loading && (
          <div className="text-center py-4 text-gray-400">Loading...</div>
        )}
        {!hasMore && messages.length > 0 && (
          <div className="text-center py-4 text-gray-400">No more messages.</div>
        )}
      </div>
    </div>
  );
} 