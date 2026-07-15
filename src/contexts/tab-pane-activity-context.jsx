"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";

const defaultValue = {
  isActive: true,
  paneHref: null,
  abortSignal: null,
};

const TabPaneActivityContext = createContext(defaultValue);

/**
 * Marks a tab pane as active or suspended. Suspended panes stay mounted
 * (hidden) so unsaved form work is kept in memory while you use other tabs.
 */
export function TabPaneActivityProvider({ paneHref, isActive, children }) {
  const [abortController, setAbortController] = useState(() => new AbortController());

  useEffect(() => {
    if (isActive) {
      // Fresh signal only when returning after a suspend abort — avoids churning
      // load callbacks on every tab switch when the previous signal is still usable.
      setAbortController((prev) => (prev.signal.aborted ? new AbortController() : prev));
      return undefined;
    }

    setAbortController((prev) => {
      if (!prev.signal.aborted) prev.abort();
      return prev;
    });
    return undefined;
  }, [isActive]);

  useEffect(() => {
    const controller = abortController;
    return () => controller.abort();
  }, [abortController]);

  const value = useMemo(
    () => ({
      isActive,
      paneHref,
      abortSignal: abortController.signal,
    }),
    [isActive, paneHref, abortController],
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
