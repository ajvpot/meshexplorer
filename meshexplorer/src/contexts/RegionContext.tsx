"use client";
import React, { createContext, useContext, ReactNode } from "react";

interface RegionContextType {
  region: string | null;
}

const RegionContext = createContext<RegionContextType | null>(null);

interface RegionProviderProps {
  children: ReactNode;
  region: string | null;
}

export function RegionProvider({ children, region }: RegionProviderProps) {
  return (
    <RegionContext.Provider value={{ region }}>
      {children}
    </RegionContext.Provider>
  );
}

export function useRegionContext() {
  const context = useContext(RegionContext);
  return context;
}
