"use client";
import Link from "next/link";
import { Cog6ToothIcon, InformationCircleIcon, ChevronDownIcon } from "@heroicons/react/24/outline";
import { useConfig } from "./ConfigContext";
import React, { useState, useEffect, useRef, useCallback } from "react";
import InfoModal from "./InfoModal";
import { getAppName } from "@/lib/api";

interface HeaderProps {
  configButtonRef?: React.Ref<HTMLButtonElement>;
}

interface NavItem {
  href: string;
  label: string;
  icon?: React.ReactNode;
  isVisible?: boolean;
}

export default function Header({ configButtonRef }: HeaderProps) {
  const { openConfig, configButtonRef: contextButtonRef } = useConfig();
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [visibleItems, setVisibleItems] = useState<NavItem[]>([]);
  const [hiddenItems, setHiddenItems] = useState<NavItem[]>([]);
  
  const navRef = useRef<HTMLElement>(null);
  const itemsRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Measure available space and determine which items can fit
  const measureAndLayout = useCallback(() => {
    // Define all navigation items
    const allNavItems: NavItem[] = [
      { href: "/messages", label: "Messages" },
      { href: "/stats", label: "Stats" },
      { href: "/search", label: "Search" },
      { href: "/api-docs", label: "API Docs" },
    ];
    if (!navRef.current || !itemsRef.current) return;

    const navWidth = navRef.current.offsetWidth;
    const rightSectionWidth = 200; // Approximate width for buttons
    const availableWidth = navWidth - rightSectionWidth - 48; // 48px for padding

    // Create temporary elements to measure item widths
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.visibility = 'hidden';
    tempContainer.style.whiteSpace = 'nowrap';
    tempContainer.className = 'flex gap-6 items-center';
    document.body.appendChild(tempContainer);

    // Measure all items first to get their widths
    const itemWidths: number[] = [];
    for (const item of allNavItems) {
      const tempItem = document.createElement('a');
      tempItem.href = item.href;
      tempItem.textContent = item.label;
      tempItem.className = 'text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors';
      tempContainer.appendChild(tempItem);
      itemWidths.push(tempItem.offsetWidth);
    }

    document.body.removeChild(tempContainer);

    // Find the cutoff point while preserving order
    let currentWidth = 0;
    let cutoffIndex = allNavItems.length;

    for (let i = 0; i < allNavItems.length; i++) {
      const itemWidth = itemWidths[i];
      const gapWidth = i > 0 ? 24 : 0; // 24px gap between items
      
      if (currentWidth + itemWidth + gapWidth <= availableWidth) {
        currentWidth += itemWidth + gapWidth;
      } else {
        cutoffIndex = i;
        break;
      }
    }

    // Split items at the cutoff point to preserve order
    const visible = allNavItems.slice(0, cutoffIndex);
    const hidden = allNavItems.slice(cutoffIndex);

    setVisibleItems(visible);
    setHiddenItems(hidden);
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      measureAndLayout();
    };

    window.addEventListener('resize', handleResize);
    measureAndLayout();

    return () => window.removeEventListener('resize', handleResize);
  }, [measureAndLayout]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <>
      <header className="w-full flex items-center justify-between px-6 py-3 text-gray-800 dark:text-gray-100 bg-white dark:bg-neutral-900 shadow z-20">
        <nav ref={navRef} className="flex gap-6 items-center flex-1">
          <Link href="/" className="font-bold text-lg flex-shrink-0">{getAppName()}</Link>
          <div ref={itemsRef} className="flex gap-6 items-center">
            {visibleItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors whitespace-nowrap"
              >
                {item.label}
              </Link>
            ))}
            {hiddenItems.length > 0 && (
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-1 text-gray-800 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  aria-label="More navigation options"
                >
                  More
                  <ChevronDownIcon className="h-4 w-4" />
                </button>
                {dropdownOpen && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-neutral-800 rounded-md shadow-lg border border-gray-200 dark:border-neutral-700 z-30">
                    {hiddenItems.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block px-4 py-2 text-sm text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
                        onClick={() => setDropdownOpen(false)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </nav>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setInfoModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label={`Open information about ${getAppName()}`}
          >
            <InformationCircleIcon className="h-6 w-6" />
            <span className="hidden sm:inline">Info</span>
          </button>
          <button
            ref={configButtonRef || contextButtonRef}
            onClick={openConfig}
            className="flex items-center gap-2 px-3 py-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Open settings menu"
          >
            <Cog6ToothIcon className="h-6 w-6" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </header>
      <InfoModal isOpen={infoModalOpen} onClose={() => setInfoModalOpen(false)} />
    </>
  );
} 