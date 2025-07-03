"use client";
import Link from "next/link";
import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { useConfig } from "./ConfigContext";
import React from "react";

interface HeaderProps {
  configButtonRef?: React.Ref<HTMLButtonElement>;
}

export default function Header({ configButtonRef }: HeaderProps) {
  const { openConfig, configButtonRef: contextButtonRef } = useConfig();
  return (
    <header className="w-full flex items-center justify-between px-6 py-3 bg-white dark:bg-neutral-900 shadow z-20">
      <nav className="flex gap-6 items-center">
        <Link href="/" className="font-bold text-lg">MeshExplorer</Link>
        <Link href="/about">About</Link>
        <Link href="/docs">Docs</Link>
      </nav>
      <button
        ref={configButtonRef || contextButtonRef}
        onClick={openConfig}
        className="flex items-center gap-2 px-3 py-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
        aria-label="Open configuration menu"
      >
        <Cog6ToothIcon className="h-6 w-6" />
        <span className="hidden sm:inline">Config</span>
      </button>
    </header>
  );
} 