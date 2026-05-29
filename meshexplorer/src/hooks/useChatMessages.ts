"use client";

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { Code, ConnectError } from '@connectrpc/connect';
import { chatClient } from '@/lib/connect/client';
import type { ChatMessage } from '@/gen/meshexplorer/v1/chat_pb';

interface ChatMessagesParams {
  channelId?: string;
  region?: string;
  enabled?: boolean;
  autoRefreshEnabled?: boolean;
}

interface ChatMessagesPage {
  messages: ChatMessage[];
  hasMore: boolean;
  oldestTimestamp?: string;
}

const PAGE_SIZE = 20;

// Inserts a single streamed message into the infinite-query cache, de-duping by
// messageId, keeping newest-first order, and re-paginating into PAGE_SIZE pages.
function mergeStreamedMessage(oldData: any, newMessage: ChatMessage) {
  if (!oldData?.pages?.[0]) return oldData;

  const all = oldData.pages.flatMap((p: ChatMessagesPage) => p.messages) as ChatMessage[];
  const existingIndex = all.findIndex((m) => m.messageId === newMessage.messageId);

  let merged: ChatMessage[];
  if (existingIndex !== -1) {
    merged = [...all];
    merged[existingIndex] = newMessage;
  } else {
    merged = [newMessage, ...all];
  }

  merged.sort(
    (a, b) => new Date(b.ingestTimestamp).getTime() - new Date(a.ingestTimestamp).getTime(),
  );

  const pages = [];
  for (let i = 0; i < merged.length; i += PAGE_SIZE) {
    const pageIndex = Math.floor(i / PAGE_SIZE);
    pages.push({
      ...(oldData.pages[pageIndex] || { hasMore: false }),
      messages: merged.slice(i, i + PAGE_SIZE),
    });
  }

  return { ...oldData, pages };
}

export function useChatMessages({
  channelId,
  region,
  enabled = true,
  autoRefreshEnabled = true,
}: ChatMessagesParams) {
  const queryClient = useQueryClient();

  // Build base query key
  const baseQueryKey = useMemo(
    () => ['chat-messages', channelId, region] as const,
    [channelId, region],
  );

  // Infinite query loads message history (older pages) via the unary GetChat RPC.
  const messagesQuery = useInfiniteQuery({
    queryKey: baseQueryKey,
    queryFn: async ({ pageParam, signal }): Promise<ChatMessagesPage> => {
      if (!region) {
        throw new Error('Region is required');
      }

      const res = await chatClient.getChat(
        {
          limit: PAGE_SIZE,
          region,
          channelId: channelId || undefined,
          before: pageParam || undefined,
        },
        { signal },
      );

      const messages = res.messages;

      return {
        messages,
        hasMore: messages.length === PAGE_SIZE,
        oldestTimestamp:
          messages.length > 0 ? messages[messages.length - 1].ingestTimestamp : undefined,
      };
    },
    getNextPageParam: (lastPage) => {
      return lastPage.hasMore ? lastPage.oldestTimestamp : undefined;
    },
    initialPageParam: undefined as string | undefined,
    enabled: enabled && !!region,
    staleTime: 10 * 1000, // 10 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });

  // Live updates: subscribe to the StreamChat server-streaming RPC and merge new
  // messages into the cache as they arrive (replaces the old 5s polling query).
  useEffect(() => {
    if (!enabled || !autoRefreshEnabled || !region) {
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    (async () => {
      try {
        const stream = chatClient.streamChat(
          {
            channelId: channelId || undefined,
            region,
            // History is loaded by GetChat; only stream messages from now on.
            skipInitialMessages: true,
          },
          { signal: controller.signal },
        );

        for await (const resp of stream) {
          if (cancelled) break;
          if (!resp.message) continue;
          const msg = resp.message;
          queryClient.setQueryData(baseQueryKey, (oldData: any) =>
            mergeStreamedMessage(oldData, msg),
          );
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof ConnectError && err.code === Code.Canceled) return;
        // A dropped stream shouldn't crash the chat UI; history is still usable.
        console.warn('Chat stream error:', err);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [enabled, autoRefreshEnabled, region, channelId, queryClient, baseQueryKey]);

  // Flatten all messages from all pages
  const allMessages = messagesQuery.data?.pages.flatMap((page) => page.messages) ?? [];

  return {
    messages: allMessages,
    loading: messagesQuery.isLoading,
    error: messagesQuery.error,
    hasMore: messagesQuery.hasNextPage,
    loadMore: messagesQuery.fetchNextPage,
    isLoadingMore: messagesQuery.isFetchingNextPage,
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: baseQueryKey });
    },
    isRefreshing: messagesQuery.isRefetching,
  };
}
