"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";

const defaultValue = {
  isActive: true,
  paneHref: null,
  abortSignal: null,
};

const TabPaneActivityContext = createContext(defaultValue);

function paneKeyFromHref(paneHref) {
  if (!paneHref) return "__no_pane__";
  const path = String(paneHref).split("?")[0] || "";
  return path || "__no_pane__";
}

/**
 * Marks a tab pane as active or suspended.
 *
 * Keep-alive panes must NOT share an AbortController that aborts on suspend or
 * unmount — React Strict Mode remounts and tab switches were surfacing
 * AbortError on create/edit forms. Request cancellation belongs inside the
 * screen (local effects), not the tab host.
 */
export function TabPaneActivityProvider({ paneHref, isActive, children }) {
  const value = useMemo(
    () => ({
      isActive,
      paneHref,
      abortSignal: null,
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
 * Re-runs when the pane becomes active again — use useTabAwareDataLoad for fetches.
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
 * load failed while the pane was active.
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
        /* allow retry when the pane is active again after a failed load */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isActive, loadFn]);
}

/** @type {Map<string, string>} */
const loadedDepsByPane = new Map();

/**
 * Fetch/reload while the pane is active when the load identity / depsKey changes.
 * Returning to a keep-alive tab does NOT refetch for the same deps.
 *
 * Usage:
 * - useTabAwareDataLoad(loadFn) — load while active when filters change; skip
 *   refetch on tab return even if loadFn identity churned while suspended
 * - useTabAwareDataLoad(loadFn, { depsKey, hasData }) — skip when depsKey was already
 *   loaded for this pane and the screen still has (or restored) data
 *
 * Call loadFn() directly from Refresh. Use invalidateTabAwareDataLoad(paneHref) if
 * the next activation must fetch again.
 */
export function useTabAwareDataLoad(loadFn, options) {
  const { isActive, paneHref } = useTabPaneActive();
  const loadFnRef = useRef(loadFn);
  const lastLoadedFnRef = useRef(null);
  const wasActiveRef = useRef(false);
  const loadedOnceRef = useRef(false);

  const depsKey = options?.depsKey;
  const hasData = Boolean(options?.hasData);
  const paneKey = paneKeyFromHref(paneHref);

  useEffect(() => {
    loadFnRef.current = loadFn;
  }, [loadFn]);

  useEffect(() => {
    if (!isActive) {
      wasActiveRef.current = false;
      return undefined;
    }

    const becameActive = !wasActiveRef.current;
    wasActiveRef.current = true;

    if (depsKey != null) {
      if (loadedDepsByPane.get(paneKey) === depsKey && hasData) {
        return undefined;
      }
      let cancelled = false;
      void (async () => {
        await loadFnRef.current();
        if (!cancelled) {
          loadedDepsByPane.set(paneKey, depsKey);
          loadedOnceRef.current = true;
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    // Bare mode: filter/pagination changes while active must reload. Returning to
    // a suspended tab must not reload just because loadFn got a new identity.
    if (becameActive && loadedOnceRef.current) {
      lastLoadedFnRef.current = loadFn;
      return undefined;
    }

    if (lastLoadedFnRef.current === loadFn) return undefined;
    lastLoadedFnRef.current = loadFn;
    void (async () => {
      await loadFn();
      loadedOnceRef.current = true;
    })();
    return undefined;
  }, [isActive, loadFn, paneKey, depsKey, hasData]);
}

/** Force the next depsKey-based activation to reload. */
export function invalidateTabAwareDataLoad(paneHref) {
  loadedDepsByPane.delete(paneKeyFromHref(paneHref));
}

/** Mark deps as already loaded (e.g. after hydrating from tab pane cache). */
export function markTabAwareDataLoaded(paneHref, depsKey) {
  if (depsKey == null) return;
  loadedDepsByPane.set(paneKeyFromHref(paneHref), depsKey);
}
