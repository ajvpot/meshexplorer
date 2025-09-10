"use client";
import dynamic from "next/dynamic";
import { ExternalLink } from "lucide-react";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

export default function EmbedMapPage() {
  return (
    <div className="relative w-full h-screen">
      <MapView />
      <div className="absolute bottom-4 left-4 z-[1000]">
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800 px-3 py-2 rounded-md shadow-lg text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white transition-colors duration-200 flex items-center gap-2"
        >
          MeshExplorer
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  );
}
