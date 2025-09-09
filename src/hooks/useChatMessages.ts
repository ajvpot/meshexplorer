"use client";

import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { buildApiUrl } from '../lib/api';
import { ChatMessage } from '../components/ChatMessageItem';

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

export function useChatMessages({
  channelId,
  region,
  enabled = true,
  autoRefreshEnabled = true,
}: ChatMessagesParams) {
  const queryClient = useQueryClient();

  // Build base query key
  const baseQueryKey = useMemo(() => 
    ['chat-messages', channelId, region] as const, 
    [channelId, region]
  );

  // Main infinite query for loading messages with pagination
  const messagesQuery = useInfiniteQuery({
    queryKey: baseQueryKey,
    queryFn: async ({ pageParam, signal }): Promise<ChatMessagesPage> => {
      if (!region) {
        throw new Error('Region is required');
      }

      let url = `/api/chat?limit=${PAGE_SIZE}&region=${encodeURIComponent(region)}`;
      if (channelId) {
        url += `&channel_id=${channelId}`;
      }
      
      if (pageParam) {
        url += `&before=${encodeURIComponent(pageParam)}`;
      }

      const response = await fetch(buildApiUrl(url), { signal });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch chat messages: ${response.statusText}`);
      }
      
      const data = await response.json();
      const messages = Array.isArray(data) ? data : [];
      
      return {
        messages,
        hasMore: messages.length === PAGE_SIZE,
        oldestTimestamp: messages.length > 0 ? messages[messages.length - 1].ingest_timestamp : undefined,
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

  // Auto-refresh query to get newer messages
  const latestTimestamp = messagesQuery.data?.pages[0]?.messages[0]?.ingest_timestamp;
  
  const autoRefreshQuery = useQuery({
    queryKey: [...baseQueryKey, 'auto-refresh', latestTimestamp],
    queryFn: async ({ signal }): Promise<ChatMessage[]> => {
      if (!region || !latestTimestamp) {
        return [];
      }

      let url = `/api/chat?limit=${PAGE_SIZE}&region=${encodeURIComponent(region)}`;
      if (channelId) {
        url += `&channel_id=${channelId}`;
      }
      url += `&after=${encodeURIComponent(latestTimestamp)}`;

      const response = await fetch(buildApiUrl(url), { signal });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch new chat messages: ${response.statusText}`);
      }
      
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: enabled && autoRefreshEnabled && !!region && !!latestTimestamp,
    refetchInterval: 5000, // 5 seconds
    staleTime: 0, // Always fresh for auto-refresh
    retry: 1,
  });

  // When auto-refresh finds new messages, update the main query
  useEffect(() => {
    if (autoRefreshQuery.data && autoRefreshQuery.data.length > 0) {
      queryClient.setQueryData(baseQueryKey, (oldData: any) => {
        if (!oldData?.pages?.[0]) return oldData;
        
        const newMessages = autoRefreshQuery.data;
        const firstPage = oldData.pages[0];
        
        // Add new messages to the beginning of the first page
        const updatedFirstPage = {
          ...firstPage,
          messages: [...newMessages, ...firstPage.messages]
        };
        
        return {
          ...oldData,
          pages: [updatedFirstPage, ...oldData.pages.slice(1)]
        };
      });
    }
  }, [autoRefreshQuery.data, queryClient, baseQueryKey]);

  // Flatten all messages from all pages
  const allMessages = messagesQuery.data?.pages.flatMap(page => page.messages) ?? [];
  
  // Check if there are more pages to load
  const hasNextPage = messagesQuery.hasNextPage;
  
  return {
    messages: allMessages,
    loading: messagesQuery.isLoading,
    error: messagesQuery.error || autoRefreshQuery.error,
    hasMore: hasNextPage,
    loadMore: messagesQuery.fetchNextPage,
    isLoadingMore: messagesQuery.isFetchingNextPage,
    refresh: () => {
      queryClient.invalidateQueries({ queryKey: baseQueryKey });
    },
    isRefreshing: messagesQuery.isRefetching,
  };
}
