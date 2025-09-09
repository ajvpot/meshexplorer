"use client";

import React from "react";

interface PathDisplayProps {
  path: string;
  origin_pubkey: string;
  className?: string;
}

export default function PathDisplay({ 
  path, 
  origin_pubkey, 
  className = ""
}: PathDisplayProps) {
  // Parse path into 2-character slices
  const pathSlices = path.match(/.{1,2}/g) || [];
  const formattedPath = pathSlices.join(' ');
  
  // Get first 2 characters of the pubkey for display
  const pubkeyPrefix = origin_pubkey.substring(0, 2);
  
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="font-mono text-sm">{formattedPath}</span>
      <span className="text-blue-600 dark:text-blue-400 text-sm">({pubkeyPrefix})</span>
    </div>
  );
}
