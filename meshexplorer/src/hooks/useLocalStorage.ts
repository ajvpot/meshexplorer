"use client";
import { useState, useEffect, useRef } from 'react';

/**
 * A hook that provides localStorage persistence for state values
 * @param key The localStorage key to use
 * @param defaultValue The default value to use if nothing is stored
 * @returns A tuple of [value, setValue] similar to useState
 */
export function useLocalStorage<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  // Load from localStorage synchronously on first render
  const getInitialValue = (): T => {
    if (typeof window === 'undefined') {
      return defaultValue;
    }
    
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        return typeof defaultValue === 'object' && defaultValue !== null 
          ? { ...defaultValue, ...parsed } 
          : parsed;
      }
    } catch (error) {
      console.warn(`Failed to load from localStorage key "${key}":`, error);
    }
    
    return defaultValue;
  };

  const [value, setValue] = useState<T>(getInitialValue);
  const firstRender = useRef(true);

  // Save to localStorage when value changes (except on first render)
  useEffect(() => {
    if (!firstRender.current) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn(`Failed to save to localStorage key "${key}":`, error);
      }
    } else {
      firstRender.current = false;
    }
  }, [key, value]);

  const setStoredValue = (newValue: T | ((prev: T) => T)) => {
    setValue(newValue);
  };

  return [value, setStoredValue];
}
