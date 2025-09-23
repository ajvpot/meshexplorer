"use client";

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo, useState, useEffect, useRef } from 'react';

export function useQueryParams<T extends Record<string, any>>(defaultValues: T = {} as T) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [internalState, setInternalState] = useState<T>(() => {
    const result = { ...defaultValues };
    
    // Initialize from search params on mount
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      urlParams.forEach((value, key) => {
        // Don't auto-convert 'q' (query) parameter to number since it should always be a string
        if (key !== 'q' && !isNaN(Number(value)) && value !== '') {
          result[key as keyof T] = Number(value) as T[keyof T];
        } else {
          result[key as keyof T] = value as T[keyof T];
        }
      });
    }
    
    return result;
  });
  
  const internalStateRef = useRef(internalState);
  internalStateRef.current = internalState;

  // Only update internal state when searchParams change from external navigation
  // (not from our own updates)
  useEffect(() => {
    const newState = { ...defaultValues };
    
    searchParams.forEach((value, key) => {
      // Don't auto-convert 'q' (query) parameter to number since it should always be a string
      if (key !== 'q' && !isNaN(Number(value)) && value !== '') {
        newState[key as keyof T] = Number(value) as T[keyof T];
      } else {
        newState[key as keyof T] = value as T[keyof T];
      }
    });
    
    // Only update if the state is actually different
    const stateChanged = JSON.stringify(newState) !== JSON.stringify(internalStateRef.current);
    if (stateChanged) {
      setInternalState(newState);
    }
  }, [searchParams, defaultValues]);

  const query = internalState;

  const updateQuery = useCallback((updates: Partial<T>) => {
    const newState = { ...internalState, ...updates };
    setInternalState(newState);
    
    const newSearchParams = new URLSearchParams();
    
    Object.entries(newState).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '' && value !== defaultValues[key as keyof T]) {
        newSearchParams.set(key, value.toString());
      }
    });

    const newUrl = `${window.location.pathname}${newSearchParams.toString() ? `?${newSearchParams.toString()}` : ''}`;
    
    // Use native History API for shallow-like routing
    window.history.replaceState(null, '', newUrl);
  }, [internalState, defaultValues]);

  const setParam = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    updateQuery({ [key]: value } as unknown as Partial<T>);
  }, [updateQuery]);

  const clearParam = useCallback((key: keyof T) => {
    const newState = { ...internalState };
    delete newState[key];
    setInternalState(newState);
    
    const newSearchParams = new URLSearchParams();
    
    Object.entries(newState).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '' && v !== defaultValues[k as keyof T]) {
        newSearchParams.set(k, v.toString());
      }
    });
    
    const newUrl = `${window.location.pathname}${newSearchParams.toString() ? `?${newSearchParams.toString()}` : ''}`;
    window.history.replaceState(null, '', newUrl);
  }, [internalState, defaultValues]);

  const clearAll = useCallback(() => {
    setInternalState({ ...defaultValues });
    window.history.replaceState(null, '', window.location.pathname);
  }, [defaultValues]);

  return {
    query,
    updateQuery,
    setParam,
    clearParam,
    clearAll,
  };
}

// Legacy hook for backward compatibility - now uses the generic hook
export interface SearchQuery {
  q: string;
  limit?: number;
  exact?: boolean;
  is_repeater?: boolean;
}

export function useSearchQuery() {
  const { query, setParam } = useQueryParams<SearchQuery>({ q: '', limit: 50, exact: false, is_repeater: false });
  
  return {
    query,
    setQuery: (q: string) => setParam('q', q),
    setLimit: (limit: number) => setParam('limit', limit),
    setExact: (exact: boolean) => setParam('exact', exact),
    setIsRepeater: (is_repeater: boolean) => setParam('is_repeater', is_repeater),
    updateQuery: (updates: Partial<SearchQuery>) => {
      Object.entries(updates).forEach(([key, value]) => {
        setParam(key as keyof SearchQuery, value as any);
      });
    },
  };
}
