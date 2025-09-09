"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Popover } from 'react-tiny-popover';
import { useMeshcoreSearch } from '@/hooks/useMeshcoreSearch';
import { useConfig } from '@/components/ConfigContext';
import NodeCard from '@/components/NodeCard';

interface NodeLinkWithHoverProps {
  nodeName: string;
  children: React.ReactNode;
}

export default function NodeLinkWithHover({ 
  nodeName, 
  children 
}: NodeLinkWithHoverProps) {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isWaitingForSearch, setIsWaitingForSearch] = useState(false);
  const { config } = useConfig();
  const router = useRouter();

  // Search query - enabled immediately when component mounts
  const { 
    data: searchData, 
    isLoading: isSearchLoading, 
    error: searchError 
  } = useMeshcoreSearch({
    query: nodeName,
    region: config.selectedRegion,
    lastSeen: config.lastSeen,
    limit: 10,
    exact: true,
    enabled: !!nodeName
  });

  const searchResults = searchData?.results || [];
  const foundNode = searchResults.length === 1 ? searchResults[0] : null;
  const noResultsFound = searchData && searchResults.length === 0;
  
  // Determine the href for the Link component - handles all cases
  const linkHref = (() => {
    // If search is loading or hasn't completed, use placeholder
    if (isSearchLoading) return "#";
    
    // If exactly one result found, link directly to node
    if (foundNode) return `/meshcore/node/${foundNode.public_key}`;
    
    // If no results or multiple results, link to search page
    return `/search?q=${encodeURIComponent(nodeName)}&exact`;
  })();

  // Handle click behavior
  const handleClick = (e: React.MouseEvent) => {
    // If href is "#", prevent navigation and handle waiting
    if (linkHref === "#") {
      e.preventDefault();
      
      // If search is in progress, wait for it
      if (isSearchLoading) {
        setIsWaitingForSearch(true);
      }
    }
    // Otherwise, let Next.js Link handle the navigation
  };

  // Effect to handle navigation after search completes
  useEffect(() => {
    // Only trigger navigation when we were waiting AND search just completed
    if (isWaitingForSearch && !isSearchLoading && searchData) {
      setIsWaitingForSearch(false);
      
      // Calculate navigation URL directly here since linkHref might still be "#"
      const navigationUrl = foundNode 
        ? `/meshcore/node/${foundNode.public_key}`
        : `/search?q=${encodeURIComponent(nodeName)}&exact`;
      
      router.push(navigationUrl);
    }
  }, [isWaitingForSearch, isSearchLoading, foundNode, router, nodeName, searchData]);

  // Popover content component
  const PopoverContent = () => {
    return (
      <div className="relative bg-white dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg shadow-lg overflow-hidden">
        {isSearchLoading ? (
          <div className="p-4 text-center w-80">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600 dark:text-gray-400">Searching for {nodeName}...</p>
          </div>
        ) : searchError ? (
          <div className="p-4 text-center w-80">
            <p className="text-sm text-red-600 dark:text-red-400">Search error</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Click to search manually</p>
          </div>
        ) : foundNode ? (
          <NodeCard 
            node={foundNode} 
            className="border-0 shadow-none hover:shadow-none"
            showTopicInfo={false}
          />
        ) : searchResults.length === 0 ? (
          <div className="p-4 text-center w-80">
            <p className="text-sm text-gray-600 dark:text-gray-400">No node found for &quot;{nodeName}&quot;</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">The node may need to advert to appear</p>
          </div>
        ) : (
          <div className="p-4 text-center w-80">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {searchResults.length} nodes found for &quot;{nodeName}&quot;
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Click to see all results</p>
          </div>
        )}

        {isWaitingForSearch && (
          <div className="absolute inset-0 bg-white/80 dark:bg-neutral-800/80 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto mb-2"></div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Navigating...</p>
            </div>
          </div>
        )}
      </div>
    );
  };


  // If search completed and no results found, render gray text instead of link
  if (noResultsFound) {
    return (
      <Popover
        isOpen={isPopoverOpen}
        positions={['bottom', 'top', 'left', 'right']}
        padding={8}
        content={<PopoverContent />}
        onClickOutside={() => setIsPopoverOpen(false)}
        containerStyle={{ zIndex: "1000" }}
      >
        <span 
          className="inline-block font-bold text-gray-500 dark:text-gray-400 cursor-default"
          onMouseEnter={() => setIsPopoverOpen(true)}
          onMouseLeave={() => setIsPopoverOpen(false)}
        >
          {children}
        </span>
      </Popover>
    );
  }

  return (
    <Popover
      isOpen={isPopoverOpen}
      positions={['bottom', 'top', 'left', 'right']}
      padding={8}
      content={<PopoverContent />}
      onClickOutside={() => setIsPopoverOpen(false)}
      containerStyle={{ zIndex: "1000" }}
    >
      <Link
        href={linkHref}
        className="inline-block font-bold text-blue-800 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-200 hover:underline transition-colors"
        onMouseEnter={() => setIsPopoverOpen(true)}
        onMouseLeave={() => setIsPopoverOpen(false)}
        onClick={handleClick}
      >
        {children}
      </Link>
    </Popover>
  );
}
