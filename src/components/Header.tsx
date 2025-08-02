"use client";
import Link from "next/link";
import { Cog6ToothIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { useConfig } from "./ConfigContext";
import React, { useState } from "react";
import InfoModal from "./InfoModal";

interface HeaderProps {
  configButtonRef?: React.Ref<HTMLButtonElement>;
}

export default function Header({ configButtonRef }: HeaderProps) {
  const { openConfig, configButtonRef: contextButtonRef } = useConfig();
  const [infoModalOpen, setInfoModalOpen] = useState(false);

  return (
    <>
      <header className="w-full flex items-center justify-between px-6 py-3 bg-white dark:bg-neutral-900 shadow z-20">
        <nav className="flex gap-6 items-center">
          <Link href="/" className="font-bold text-lg">MeshExplorer</Link>
          <Link href="/messages">Messages</Link>
          <Link href="/stats">Stats</Link>
        </nav>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setInfoModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Open information about MeshExplorer"
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
      {infoModalOpen && <InfoModal onClose={() => setInfoModalOpen(false)} />}
    </>
  );
} 