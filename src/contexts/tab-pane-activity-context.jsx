"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";

const defaultValue = {
  isActive: true,
  paneHref: null,
  abortSignal: null,
};

const TabPaneActivityContext = createContext(defaultValue);

/**
 * Marks a tab pane as active or suspended. Suspended panes abort in-flight requests
 * but keep their React tree mounted (preserves form input state).
 */
export function TabPaneActivityProvider({ paneHref, isActive, children }) {
  const controllerRef = useRef(null);

  if (!controllerRef.current) {
    controllerRef.current = new AbortController();
  }

  useEffect(() => {
    if (isActive) return undefined;

    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    return undefined;
  }, [isActive]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
    },
    [],
  );

  const value = useMemo(
    () => ({
      isActive,
      paneHref,
      abortSignal: controllerRef.current?.signal ?? null,
    }),
    [isActive, paneHref],
  );

  return <TabPaneActivityContext.Provider value={value}>{children}</TabPaneActivityContext.Provider>;
}

export function useTabPaneActive() {
  return useContext(TabPaneActivityContext);
}

/**
 * Run an effect only while this tab pane is active (e.g. polling, refetch).
 * Does not re-run when the user returns to a suspended form tab.
 */
export function useTabAwareEffect(effect, deps) {
  const { isActive } = useTabPaneActive();

  useEffect(() => {
    if (!isActive) return undefined;
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies deps
  }, [isActive, ...deps]);
}

/**
 * Load data once the first time a pane becomes active. Skips reload when returning
 * to a suspended form tab so unsaved inputs are not reset. Retries if the first
 * load was aborted (tab switched away mid-fetch).
 */
export function useTabAwareInitialLoad(loadFn) {
  const { isActive } = useTabPaneActive();
  const completedRef = useRef(false);

  useEffect(() => {
    if (!isActive || completedRef.current) return undefined;

    let cancelled = false;
    void (async () => {
      try {
        await loadFn();
        if (!cancelled) completedRef.current = true;
      } catch {
        /* allow retry when the pane is active again after abort */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isActive, loadFn]);
}
