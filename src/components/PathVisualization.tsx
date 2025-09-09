"use client";

import React, { useState, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Tree from 'react-d3-tree';
import { ArrowsPointingOutIcon, ArrowsPointingInIcon } from "@heroicons/react/24/outline";
import PathDisplay from "./PathDisplay";

export interface PathData {
  origin: string;
  pubkey: string;
  path: string;
}

interface PathGroup {
  path: string;
  pathSlices: string[];
  indices: number[];
}

interface TreeNode {
  name: string;
  children?: TreeNode[];
}

interface PathVisualizationProps {
  paths: PathData[];
  title?: string;
  className?: string;
  showDropdown?: boolean;
  initiatingNodeKey?: string;
}

export default function PathVisualization({ 
  paths, 
  title = "Paths", 
  className = "",
  showDropdown = true,
  initiatingNodeKey
}: PathVisualizationProps) {
  const [expanded, setExpanded] = useState(false);
  const [showGraph, setShowGraph] = useState(false);
  const [graphFullscreen, setGraphFullscreen] = useState(false);

  const pathsCount = paths.length;

  // Process data for tree visualization
  const treeData = useMemo(() => {
    if (!showGraph || pathsCount === 0) return null;

    // Group messages by path similarity
    const pathGroups: PathGroup[] = [];
    
    paths.forEach(({ origin, pubkey, path }, index) => {
      // Parse path into 2-character slices and include pubkey as final hop
      const pathSlices = path.match(/.{1,2}/g) || [];
      const pubkeyPrefix = pubkey.substring(0, 2);
      const fullPathSlices = [...pathSlices, pubkeyPrefix];
      
      // Find existing group with same path structure
      const existingGroup = pathGroups.find(group => 
        group.pathSlices.length === fullPathSlices.length &&
        group.pathSlices.every((slice, i) => slice === fullPathSlices[i])
      );
      
      if (existingGroup) {
        existingGroup.indices.push(index);
      } else {
        pathGroups.push({
          path: path + pubkeyPrefix,
          pathSlices: fullPathSlices,
          indices: [index]
        });
      }
    });

    // Build tree structure for react-d3-tree
    const buildTree = (): TreeNode => {
      const rootName = initiatingNodeKey ? initiatingNodeKey.substring(0, 2) : "??";
      const root: TreeNode = { name: rootName, children: [] };
      
      pathGroups.forEach(group => {
        let currentNode = root;
        
        group.pathSlices.forEach((slice, level) => {
          let child = currentNode.children?.find(c => c.name === slice);
          
          if (!child) {
            child = { name: slice, children: [] };
            if (!currentNode.children) currentNode.children = [];
            currentNode.children.push(child);
          }
          
          currentNode = child;
        });
      });
      
      return root;
    };

    return buildTree();
  }, [showGraph, paths, pathsCount, initiatingNodeKey]);

  const handleToggle = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  const handleGraphToggle = useCallback(() => {
    setShowGraph(prev => !prev);
  }, []);

  const handleFullscreenToggle = useCallback(() => {
    setGraphFullscreen(prev => !prev);
  }, []);

  const PathsList = useCallback(() => (
    <div className="mt-1 p-2 bg-gray-100 dark:bg-neutral-700 rounded text-xs break-all text-gray-800 dark:text-gray-200">
      {paths.map(({ origin, pubkey, path }, index) => (
        <div key={index} className="flex items-center gap-2">
          <Link 
            href={`/meshcore/node/${pubkey}`}
            className="hover:underline cursor-pointer"
          >
            {origin}
          </Link>
          <PathDisplay 
            path={path} 
            origin_pubkey={pubkey} 
            className="text-xs"
          />
        </div>
      ))}
    </div>
  ), [paths]);

  const GraphView = useCallback(() => {
    if (!showGraph || pathsCount === 0 || !treeData) return null;

    const renderTree = () => (
      <Tree
        key={`tree-${pathsCount}`}
        data={treeData}
        orientation="vertical"
        pathFunc="step"
        translate={{ x: graphFullscreen ? 300 : 200, y: graphFullscreen ? 80 : 50 }}
        separation={{ siblings: 1.2, nonSiblings: 1.5 }}
        nodeSize={{ x: 60, y: 60 }}
        zoomable={true}
        draggable={true}
        renderCustomNodeElement={({ nodeDatum, toggleNode }) => {
          const rootName = initiatingNodeKey ? initiatingNodeKey.substring(0, 2) : "??";
          const isRoot = nodeDatum.name === rootName;
          // Check if this node represents an origin pubkey (final 2-char hex from pubkey)
          const isOriginPubkey = paths.some(({ pubkey }) => {
            const pubkeyPrefix = pubkey.substring(0, 2);
            return nodeDatum.name === pubkeyPrefix;
          });
          
          return (
            <g key={`node-${nodeDatum.name}`}>
              <circle 
                r={15} 
                fill={isRoot ? "#3b82f6" : "#6b7280"}
                stroke={isOriginPubkey && !isRoot ? "#10b981" : "none"}
                strokeWidth={isOriginPubkey && !isRoot ? 2 : 0}
              />
              <text
                textAnchor="middle"
                y="5"
                style={{ fontSize: "12px", fill: "white", fontWeight: "bold", stroke: "none" }}
              >
                {nodeDatum.name}
              </text>
            </g>
          );
        }}
      />
    );

    if (graphFullscreen && typeof window !== 'undefined') {
      return createPortal(
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-neutral-900 rounded-lg p-4 max-w-7xl max-h-4xl w-full h-full flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                Path Visualization
              </h3>
              <button
                onClick={handleFullscreenToggle}
                className="p-2 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
              >
                <ArrowsPointingInIcon className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <div className="w-full h-full border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-600">
                {renderTree()}
              </div>
            </div>
          </div>
        </div>,
        document.body
      );
    }

    return (
      <div className="mt-2">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Path Graph
          </span>
          <button
            onClick={handleFullscreenToggle}
            className="p-1 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
          >
            <ArrowsPointingOutIcon className="w-4 h-4" />
          </button>
        </div>
        <div className="w-full h-64 border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-600">
          {renderTree()}
        </div>
      </div>
    );
  }, [showGraph, pathsCount, treeData, graphFullscreen, handleFullscreenToggle, paths, initiatingNodeKey]);

  if (!showDropdown) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm text-gray-600 dark:text-gray-300">
            {pathsCount} path{pathsCount !== 1 ? 's' : ''}
          </span>
          {pathsCount > 0 && (
            <button
              onClick={handleGraphToggle}
              className="flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-100 transition-colors text-sm"
            >
              <span>{showGraph ? 'Hide Graph' : 'Show Graph'}</span>
            </button>
          )}
        </div>
        <PathsList />
        {showGraph && <GraphView />}
      </div>
    );
  }

  return (
    <div className={`text-sm text-gray-600 dark:text-gray-300 ${className}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={handleToggle}
          className="flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
        >
          <span>{pathsCount} path{pathsCount !== 1 ? 's' : ''}</span>
          <svg
            className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {pathsCount > 0 && (
          <button
            onClick={handleGraphToggle}
            className="flex items-center gap-1 hover:text-gray-800 dark:hover:text-gray-100 transition-colors"
          >
            <span>{showGraph ? 'Hide Graph' : 'Show Graph'}</span>
          </button>
        )}
      </div>
      
      {expanded && pathsCount > 0 && (
        <PathsList />
      )}
      
      <GraphView />
    </div>
  );
}
