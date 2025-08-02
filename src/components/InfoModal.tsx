"use client";
import React from "react";
import { getAppName } from "../lib/api";
import Modal from "./Modal";

interface InfoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function InfoModal({ isOpen, onClose }: InfoModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`About ${getAppName()}`}>
      <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              {getAppName()} is a web-based visualization tool for exploring and monitoring mesh networks. 
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
            <h3 className="text-md font-medium mb-2">Community</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              Connect with the Puget Mesh community, a volunteer group supporting AREDN, Meshtastic, and other off-grid mesh networks in the Puget Sound Region.
            </p>
            <a
              href="https://pugetmesh.org/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Visit Puget Mesh
            </a>
          </div>
          
          <div className="border-t border-gray-200 dark:border-neutral-700 pt-4">
            <h3 className="text-md font-medium mb-2">Contributing</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
              {getAppName()} is open source and welcomes contributions from the community.
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
      </Modal>
    );
} 