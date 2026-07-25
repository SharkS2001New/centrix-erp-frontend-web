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
 * External POS offline readiness: catalog snapshot, reserved order numbers,
 * reconnect sync, and live online/offline flag.
 */
export function usePosOfflineSupport({ enabled = false } = {}) {
  const { status, browserOnline, apiOnline } = useNetworkStatus({
    enabled,
    reportOutages: false,
  });
  const online = status === "online" || status === "slow";
  const [pendingSync, setPendingSync] = useState(0);
  const [orderNumbersLeft, setOrderNumbersLeft] = useState(0);
  const [catalogReady, setCatalogReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState(null);
  const wasOnlineRef = useRef(online);
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
    if (!enabled || !online) return null;
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
  }, [enabled, online]);

  const flushOutbox = useCallback(async () => {
    if (!enabled || !online || syncingRef.current) return [];
    syncingRef.current = true;
    setSyncing(true);
    try {
      const results = await syncPosOfflineOutbox();
      const failed = results.filter((r) => !r.ok);
      const ok = results.filter((r) => r.ok);
      if (ok.length) {
        setLastSyncMessage(
          failed.length
            ? `Synced ${ok.length} offline sale(s); ${failed.length} failed.`
            : `Synced ${ok.length} offline sale(s).`,
        );
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
  }, [enabled, online, refreshCounts]);

  useEffect(() => {
    if (!enabled) return undefined;
    void prepare();
    void refreshCounts();
  }, [enabled, prepare, refreshCounts]);

  useEffect(() => {
    if (!enabled) return undefined;
    const wasOnline = wasOnlineRef.current;
    wasOnlineRef.current = online;
    if (!wasOnline && online) {
      void (async () => {
        await flushOutbox();
        await prepare();
      })();
    }
  }, [enabled, online, flushOutbox, prepare]);

  const searchOffline = useCallback(async (query, limit = 40) => {
    return searchPosOfflineCatalog(query, { limit });
  }, []);

  return {
    offlineMode: enabled && !online,
    online,
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
