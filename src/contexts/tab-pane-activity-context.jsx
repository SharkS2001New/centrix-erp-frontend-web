"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";

const defaultValue = {
  isActive: true,
  paneHref: null,
  abortSignal: null,
};

const TabPaneActivityContext = createContext(defaultValue);

/**
 * Marks a tab pane as active or suspended. Suspended panes stay mounted
 * (hidden) so loaded data and form state survive switching tabs.
 *
 * In-flight fetches are NOT aborted on suspend — that was forcing every
 * return-to-tab to refetch. Abort only runs when the pane unmounts (tab closed).
 */
export function TabPaneActivityProvider({ paneHref, isActive, children }) {
  const abortControllerRef = useRef(null);
  if (abortControllerRef.current == null) {
    abortControllerRef.current = new AbortController();
  }

  useEffect(() => {
    const controller = abortControllerRef.current;
    return () => {
      controller?.abort();
    };
  }, []);

  const value = useMemo(
    () => ({
      isActive,
      paneHref,
      abortSignal: abortControllerRef.current?.signal ?? null,
    }),
    [isActive, paneHref],
  );

  return <TabPaneActivityContext.Provider value={value}>{children}</TabPaneActivityContext.Provider>;
}

export function useTabPaneActive() {
  return useContext(TabPaneActivityContext);
}

/**
 * Run an effect only while this tab pane is active (e.g. polling).
 * Does not re-run merely because the user returns to a suspended tab — deps must change.
 */
export function useTabAwareEffect(effect, deps) {
  const { isActive } = useTabPaneActive();
  const isActiveRef = useRef(isActive);

  useEffect(() => {
    isActiveRef.current = isActive;
  }, [isActive]);

  useEffect(() => {
    if (!isActiveRef.current) return undefined;
    return effect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller supplies deps; isActive is gated via ref
  }, deps);
}

/**
 * Load data once the first time a pane becomes active. Skips reload when returning
 * to a suspended tab so already-loaded data and unsaved inputs stay put.
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
        /* allow retry if the first load failed */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isActive, loadFn]);
}
