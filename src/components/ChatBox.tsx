"use client";
import { useState } from "react";
import { MinusIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useConfig } from "./ConfigContext";
import { getChannelIdFromKey } from "@/lib/meshcore";
import ChatMessageItem from "./ChatMessageItem";
import RefreshButton from "./RefreshButton";
import RegionSelector from "./RegionSelector";
import { getRegionConfig } from "@/lib/regions";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useIntersectionObserver } from "@/hooks/useIntersectionObserver";
import { useQueryParams } from "@/hooks/useQueryParams";


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

interface ChatBoxQuery {
  selectedTab?: number;
}

export default function ChatBox({
  showAllMessagesTab = false,
  className = "",
  startExpanded = false,
}: ChatBoxProps) {
  const { config, openKeyModal } = useConfig();
  const meshcoreKeys: TabItem[] = [
    { channelName: "Public", privateKey: "izOH6cXN6mrJ5e26oRXNcg==" },
    ...(config?.meshcoreKeys || []),
  ];

  // Add "All Messages" tab if requested
  const allTabs: TabItem[] = showAllMessagesTab
    ? [{ channelName: "All Messages", privateKey: "", isAllMessages: true }, ...meshcoreKeys]
    : meshcoreKeys;

  // Use query params to persist selected tab across navigation
  const { query, setParam } = useQueryParams<ChatBoxQuery>({
    selectedTab: showAllMessagesTab ? 1 : 0,
  });
  
  // Ensure selectedTab is within bounds of available tabs
  const rawSelectedTab = query.selectedTab ?? (showAllMessagesTab ? 1 : 0);
  const selectedTab = rawSelectedTab >= 0 && rawSelectedTab < allTabs.length 
    ? rawSelectedTab 
    : (showAllMessagesTab ? 1 : 0);
  const setSelectedTab = (tabIndex: number) => setParam('selectedTab', tabIndex);
  
  const [minimized, setMinimized] = useState(!startExpanded); // Use startExpanded as default for minimized state

  const selectedKey = allTabs[selectedTab];
  const channelId = selectedKey.isAllMessages
    ? undefined
    : getChannelIdFromKey(selectedKey.privateKey).toUpperCase();
  
  // Use the new chat messages hook
  const {
    messages,
    loading,
    hasMore,
    loadMore,
    isLoadingMore,
    refresh,
    isRefreshing
  } = useChatMessages({
    channelId,
    region: config?.selectedRegion,
    enabled: !minimized,
    autoRefreshEnabled: !minimized,
  });

  // Always show tabs

  // Set up intersection observer for infinite scrolling
  const loadMoreTriggerRef = useIntersectionObserver(
    () => {
      if (hasMore && !isLoadingMore && !loading) {
        loadMore();
      }
    },
    {
      threshold: 0.1,
      rootMargin: '100px',
      enabled: hasMore && !isLoadingMore && !loading
    }
  );

  const handleRefresh = () => {
    refresh();
  };

  const LoadingIndicator = () => (
    <div className="flex justify-center py-4">
      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700 dark:border-gray-200"></div>
    </div>
  );

  return (
    <div
      className={`bg-white dark:bg-neutral-900 rounded-lg shadow-lg flex flex-col ${
        startExpanded ? className : minimized ? "w-80" : "w-80 h-96"
      }`}
    >
      <div
        className={`flex items-center justify-between ps-4 pe-3 py-3 ${
          startExpanded ? "border-b border-gray-200 dark:border-neutral-800" : "min-h-8"
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap flex-shrink-0">
            MeshCore Chat
          </span>
          <span
            className="text-xs text-gray-500 dark:text-gray-400 truncate"
            title={getRegionConfig(config.selectedRegion!)?.friendlyName || config.selectedRegion}
          >
            {getRegionConfig(config.selectedRegion!)?.friendlyName || config.selectedRegion}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!minimized && config?.selectedRegion && (
            <RefreshButton
              onClick={handleRefresh}
              loading={isRefreshing}
              small={true}
              title="Refresh chat messages"
              ariaLabel="Refresh chat messages"
            />
          )}
          {!startExpanded && (
            <button
              className="p-1 rounded text-gray-800 dark:text-gray-100 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              onClick={() => setMinimized((m) => !m)}
              aria-label={minimized ? "Maximize MeshCore Chat" : "Minimize MeshCore Chat"}
            >
              {minimized ? <PlusIcon className="h-5 w-5" /> : <MinusIcon className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {!minimized && config?.selectedRegion && (
        <>
          <div
            className={`border-b border-gray-200 dark:border-neutral-800 ${
              startExpanded ? "px-4 py-2" : "mb-2"
            }`}
          >
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
              <button
                className="px-2 py-1 text-xs rounded-t whitespace-nowrap flex-shrink-0 bg-transparent text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-800"
                onClick={() => openKeyModal()}
                title="Manage channel keys"
              >
                +
              </button>
            </div>
          </div>

           <div
             className={`flex-1 overflow-y-auto text-sm text-gray-700 dark:text-gray-200 ${
               startExpanded ? "" : "flex flex-col-reverse"
             }`}
           >
             <div className={`p-4 ${startExpanded ? "flex flex-col gap-2" : "flex flex-col gap-2"}`}>
               {messages.length === 0 && !loading && (
                 <div className={`text-gray-400 text-center ${startExpanded ? "py-8" : "mt-8"}`}>
                   No chat messages found.
                 </div>
               )}
               
               {/* Messages */}
               {(startExpanded ? messages : messages.toReversed()).map((msg, i) => (
                 <ChatMessageItem
                   key={`${msg.message_id}-${msg.origin_path_info?.length || 0}`}
                   msg={msg}
                   showErrorRow={selectedKey.isAllMessages}
                 />
               ))}
               
               {/* Loading indicator */}
               {isLoadingMore && <LoadingIndicator />}
               

               {/* Load more trigger always at the bottom */}
               {hasMore && (
                 <div ref={loadMoreTriggerRef} className="h-2" />
               )}
             </div>
           </div>
        </>
      )}
      {!minimized && !config?.selectedRegion && (
        <div className="p-4 flex flex-col rounded-lg overflow-scroll">
          <RegionSelector
            className="w-full"
          />
        </div>
      )}
    </div>
  );
}
