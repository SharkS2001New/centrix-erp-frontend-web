"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import {
  ensurePosOfflineOrderNumbers,
  getPosOfflinePendingCount,
  preparePosOfflineReady,
  searchPosOfflineCatalog,
  syncPosOfflineOutbox,
  warmPosOfflineCatalog,
} from "@/lib/pos-offline";

/**
 * External POS short-outage bridge (not full offline / no service worker).
 *
 * While healthy: warm IndexedDB catalog + reserved order #s in the background.
 * When the link drops or is very slow: sell from IndexedDB (cash), queue sync.
 * Aimed at brief outages (~15 minutes); when the API is healthy again, flush outbox.
 */
export function usePosOfflineSupport({ enabled = false } = {}) {
  const { status, browserOnline, apiOnline } = useNetworkStatus({
    enabled,
    reportOutages: false,
  });
  /** Only fully healthy API — used for catalog warm / outbox sync. */
  const fullyOnline = status === "online";
  /** Sell locally when offline or too slow to complete API sales reliably. */
  const offlineMode = enabled && status !== "online";
  const [pendingSync, setPendingSync] = useState(0);
  const [orderNumbersLeft, setOrderNumbersLeft] = useState(0);
  const [catalogReady, setCatalogReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState(null);
  const wasFullyOnlineRef = useRef(fullyOnline);
  const syncingRef = useRef(false);

  const refreshCounts = useCallback(async () => {
    if (!enabled) return;
    try {
      const { peekPosOfflineOrderNumberCount } = await import("@/lib/pos-offline");
      const [left, pending] = await Promise.all([
        peekPosOfflineOrderNumberCount(),
        getPosOfflinePendingCount(),
      ]);
      setOrderNumbersLeft(left);
      setPendingSync(pending);
    } catch {
      /* ignore */
    }
  }, [enabled]);

  const prepare = useCallback(async () => {
    if (!enabled || !fullyOnline) return null;
    try {
      const ready = await preparePosOfflineReady();
      setCatalogReady(ready.catalogCount > 0);
      setOrderNumbersLeft(ready.orderNumbersAvailable);
      setPendingSync(ready.pendingSync);
      return ready;
    } catch (err) {
      console.warn("POS offline prepare failed", err);
      return null;
    }
  }, [enabled, fullyOnline]);

  const flushOutbox = useCallback(async () => {
    if (!enabled || !fullyOnline || syncingRef.current) return [];
    syncingRef.current = true;
    setSyncing(true);
    try {
      const results = await syncPosOfflineOutbox();
      const failed = results.filter((r) => !r.ok);
      const ok = results.filter((r) => r.ok);
      const reprints = ok.filter((r) => r.needs_reprint);
      if (ok.length) {
        const base = failed.length
          ? `Synced ${ok.length} offline sale(s); ${failed.length} failed.`
          : `Synced ${ok.length} offline sale(s).`;
        const reprintNote = reprints.length
          ? ` ${reprints.length} receipt(s) need reprint (order # changed: ${reprints
              .map((r) => `#${r.printed_order_num}→#${r.order_num}`)
              .join(", ")}).`
          : "";
        setLastSyncMessage(`${base}${reprintNote}`);
        await warmPosOfflineCatalog({ force: true });
        await ensurePosOfflineOrderNumbers({ force: false });
      } else if (failed.length) {
        setLastSyncMessage(`Could not sync ${failed.length} offline sale(s).`);
      }
      await refreshCounts();
      return results;
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [enabled, fullyOnline, refreshCounts]);

  useEffect(() => {
    if (!enabled) return undefined;
    void prepare();
    void refreshCounts();
  }, [enabled, prepare, refreshCounts]);

  useEffect(() => {
    if (!enabled) return undefined;
    const wasFullyOnline = wasFullyOnlineRef.current;
    wasFullyOnlineRef.current = fullyOnline;
    if (!wasFullyOnline && fullyOnline) {
      void (async () => {
        await flushOutbox();
        await prepare();
      })();
    }
  }, [enabled, fullyOnline, flushOutbox, prepare]);

  const searchOffline = useCallback(async (query, limit = 40) => {
    return searchPosOfflineCatalog(query, { limit });
  }, []);

  return {
    offlineMode,
    networkStatus: status,
    online: fullyOnline,
    browserOnline,
    apiOnline,
    pendingSync,
    orderNumbersLeft,
    catalogReady,
    syncing,
    lastSyncMessage,
    prepare,
    flushOutbox,
    refreshCounts,
    searchOffline,
  };
}
