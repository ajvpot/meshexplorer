"use client";
import React from "react";

interface InfoModalProps {
  onClose: () => void;
}

export default function InfoModal({ onClose }: InfoModalProps) {
  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-lg p-6 min-w-[350px] max-w-[500px] max-h-[60vh] overflow-auto border border-gray-200 dark:border-neutral-700 relative">
        <button
          className="absolute top-2 right-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          onClick={onClose}
          aria-label="Close info modal"
        >
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        
        <h2 className="text-lg font-semibold mb-4">About MeshExplorer</h2>
        
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              MeshExplorer is a web-based visualization tool for exploring and monitoring mesh networks. 
              It provides real-time mapping of network nodes, message tracking, and statistical analysis for MeshCore and Meshtastic networks.
            </p>
          </div>
          
          <div className="border-t border-gray-200 dark:border-neutral-700 pt-4">
            <h3 className="text-md font-medium mb-2">Getting Connected</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              To add your node to the network visualization, configure your device to publish data via MQTT. 
              Detailed connection instructions and configuration examples will be available here soon.
            </p>
            <div className="bg-gray-50 dark:bg-neutral-800 rounded p-3 border border-gray-200 dark:border-neutral-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 italic">
                MQTT connection guide coming soon...
              </p>
            </div>
          </div>
          
          <div className="border-t border-gray-200 dark:border-neutral-700 pt-4">
            <h3 className="text-md font-medium mb-2">Contributing</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              MeshExplorer is open source and welcomes contributions from the community.
            </p>
            <a
              href="https://github.com/ajvpot/meshexplorer"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              View on GitHub
            </a>
          </div>
        </div>
      </div>
    </div>
  );
} 