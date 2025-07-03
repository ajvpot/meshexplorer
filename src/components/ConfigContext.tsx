"use client";
import React, { ReactNode } from "react";

// Placeholder ConfigProvider that just renders children
export function ConfigProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

// Dummy useConfig hook
export function useConfig() {
  return {};
} 