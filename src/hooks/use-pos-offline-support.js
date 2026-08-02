"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  ensurePosOfflineOrderNumbers,
  getPosOfflinePendingCount,
  preparePosOfflineReady,
  searchPosOfflineCatalog,
  syncPosOfflineOutbox,
  warmPosOfflineCatalog,
} from "@/lib/pos-offline";

const RETRY_BACKOFF_MS = 5_000;

const EMPTY_SYNC_PROGRESS = {
  phase: "idle",
  current: 0,
  total: 0,
  done: 0,
  failed: 0,
  order_num: null,
  message: null,
};

/**
 * External POS short-outage bridge (not full offline / no service worker).
 *
 * While healthy: warm IndexedDB catalog + reserved order #s in the background.
 * Sell path: save local outbox → print → immediately flush when API is reachable
 * (including "slow" — sync still runs so the queue does not grow forever).
 * Aimed at brief outages (~30 minutes); reconnect still flushes any leftovers.
 */
export function usePosOfflineSupport({ enabled = false } = {}) {
  const { status, browserOnline, apiOnline } = useNetworkStatus({
    enabled,
    reportOutages: false,
  });
  /** Fully healthy API — used for catalog warm / order-number reserve. */
  const fullyOnline = status === "online";
  /** API reachable enough to attempt outbox flush (online or slow). */
  const canFlushOutbox = enabled && browserOnline && apiOnline;
  /** Sell locally when offline or too slow to complete API sales reliably. */
  const offlineMode = enabled && status !== "online";
  const [pendingSync, setPendingSync] = useState(0);
  const [orderNumbersLeft, setOrderNumbersLeft] = useState(0);
  const [catalogReady, setCatalogReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState(null);
  const [syncProgress, setSyncProgress] = useState(EMPTY_SYNC_PROGRESS);
  const wasFullyOnlineRef = useRef(fullyOnline);
  const wasCanFlushRef = useRef(canFlushOutbox);
  const canFlushRef = useRef(canFlushOutbox);
  const flushChainRef = useRef(Promise.resolve());
  const flushGenerationRef = useRef(0);
  const lastNotifiedSyncErrorRef = useRef(null);
  const manualFlushRef = useRef(false);

  useEffect(() => {
    canFlushRef.current = canFlushOutbox;
  }, [canFlushOutbox]);

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

  const notifySyncProblem = useCallback((message) => {
    const key = String(message ?? "");
    if (lastNotifiedSyncErrorRef.current === key) return;
    lastNotifiedSyncErrorRef.current = key;
    notifyError(`POS sync problem — reported to platform issues. ${key}`);
  }, []);

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

  /**
   * Serialize outbox flushes so concurrent sells cannot double-post.
   * Safe to call fire-and-forget after every local save.
   * Runs whenever the API is reachable (including slow).
   *
   * @param {{ manual?: boolean }} [options]
   */
  const flushOutboxNow = useCallback((options = {}) => {
    if (!enabled) return Promise.resolve([]);

    const manual = Boolean(options.manual);
    if (manual) manualFlushRef.current = true;

    const generation = ++flushGenerationRef.current;
    const run = async () => {
      if (!canFlushRef.current) {
        if (manualFlushRef.current) {
          manualFlushRef.current = false;
          setLastSyncMessage("Cannot sync while offline. Reconnect, then try again.");
          setSyncProgress({
            ...EMPTY_SYNC_PROGRESS,
            phase: "blocked",
            message: "Cannot sync while offline. Reconnect, then try again.",
          });
        }
        return [];
      }
      setSyncing(true);
      const showProgress = manualFlushRef.current;
      try {
        const results = await syncPosOfflineOutbox({
          onProgress: (progress) => {
            setSyncProgress({
              phase: progress.phase ?? "syncing",
              current: Number(progress.current ?? 0),
              total: Number(progress.total ?? 0),
              done: Number(progress.done ?? 0),
              failed: Number(progress.failed ?? 0),
              order_num: progress.order_num ?? null,
              message: progress.message ?? null,
            });
            if (progress.message) {
              setLastSyncMessage(progress.message);
            }
            // Keep the pending badge roughly accurate while a long flush runs.
            if (progress.phase === "start" || progress.phase === "item_done") {
              const remaining = Math.max(
                0,
                Number(progress.total ?? 0) -
                  Number(progress.done ?? 0) -
                  Number(progress.failed ?? 0),
              );
              setPendingSync(remaining);
            }
          },
        });
        if (generation !== flushGenerationRef.current && results.length === 0) {
          return results;
        }
        const failed = results.filter((r) => !r.ok);
        const ok = results.filter((r) => r.ok);
        const reprints = ok.filter((r) => r.needs_reprint);
        if (ok.length) {
          lastNotifiedSyncErrorRef.current = null;
          const base = failed.length
            ? `Synced ${ok.length} sale(s); ${failed.length} failed.`
            : `Synced ${ok.length} sale(s).`;
          const reprintNote = reprints.length
            ? ` ${reprints.length} receipt(s) need reprint (order # changed: ${reprints
                .map((r) => `#${r.printed_order_num}→#${r.order_num}`)
                .join(", ")}).`
            : "";
          setLastSyncMessage(`${base}${reprintNote}`);
          if (showProgress && !failed.length) {
            notifySuccess(base);
          }
          if (fullyOnline) {
            await warmPosOfflineCatalog({ force: true });
            await ensurePosOfflineOrderNumbers({ force: false });
          }
        } else if (failed.length) {
          setLastSyncMessage(`Could not sync ${failed.length} sale(s). Will retry.`);
        } else if (showProgress) {
          setLastSyncMessage("No offline orders waiting to sync.");
          setSyncProgress({
            ...EMPTY_SYNC_PROGRESS,
            phase: "complete",
            message: "No offline orders waiting to sync.",
          });
          notifySuccess("No offline orders waiting to sync.");
        }
        if (failed.length) {
          const detail = failed
            .slice(0, 3)
            .map((r) => `#${r.order_num}: ${r.error}`)
            .join("; ");
          const more = failed.length > 3 ? ` (+${failed.length - 3} more)` : "";
          notifySyncProblem(`${detail}${more}`);
        }
        await refreshCounts();
        return results;
      } catch (err) {
        console.warn("POS outbox flush failed", err);
        const message = err?.message ?? "Could not sync offline sales.";
        setLastSyncMessage(message);
        setSyncProgress({
          ...EMPTY_SYNC_PROGRESS,
          phase: "error",
          message,
        });
        notifySyncProblem(message);
        try {
          const { submitSystemIssueReport } = await import("@/lib/system-issue-reports");
          void submitSystemIssueReport({
            kind: "error",
            message: `POS outbox flush failed: ${message}`,
            context: { source: "pos_outbox_sync", phase: "flush" },
          });
        } catch {
          /* ignore */
        }
        await refreshCounts();
        return [];
      } finally {
        manualFlushRef.current = false;
        // Only clear syncing when this is the last queued flush.
        const stillQueued = generation !== flushGenerationRef.current;
        if (!stillQueued) {
          setSyncing(false);
        }
      }
    };

    const next = flushChainRef.current.then(run, run);
    flushChainRef.current = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }, [enabled, fullyOnline, refreshCounts, notifySyncProblem]);

  /** Manual Sync button — same flush path, with progress + toast feedback. */
  const syncOfflineOrders = useCallback(async () => {
    if (!enabled) return [];
    await refreshCounts();
    if (!canFlushRef.current) {
      const message = "Cannot sync while offline. Reconnect, then try again.";
      setLastSyncMessage(message);
      setSyncProgress({
        ...EMPTY_SYNC_PROGRESS,
        phase: "blocked",
        message,
      });
      notifyError(message);
      return [];
    }
    setSyncProgress({
      ...EMPTY_SYNC_PROGRESS,
      phase: "start",
      message: "Checking local offline orders…",
    });
    setLastSyncMessage("Checking local offline orders…");
    return flushOutboxNow({ manual: true });
  }, [enabled, flushOutboxNow, refreshCounts]);

  /** @deprecated prefer flushOutboxNow — kept for reconnect callers */
  const flushOutbox = flushOutboxNow;

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
        await flushOutboxNow();
        await prepare();
      })();
    }
  }, [enabled, fullyOnline, flushOutboxNow, prepare]);

  // Flush when API becomes reachable again (including recovery from offline→slow).
  useEffect(() => {
    if (!enabled) return undefined;
    const wasCanFlush = wasCanFlushRef.current;
    wasCanFlushRef.current = canFlushOutbox;
    if (!wasCanFlush && canFlushOutbox) {
      void flushOutboxNow();
    }
  }, [enabled, canFlushOutbox, flushOutboxNow]);

  // Retry leftover pending/error rows while API is reachable (short backoff).
  useEffect(() => {
    if (!enabled || !canFlushOutbox || pendingSync <= 0 || syncing) return undefined;
    const timer = window.setTimeout(() => {
      void flushOutboxNow();
    }, RETRY_BACKOFF_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, canFlushOutbox, pendingSync, syncing, flushOutboxNow]);

  const searchOffline = useCallback(async (query, limit = 40) => {
    return searchPosOfflineCatalog(query, { limit });
  }, []);

  return {
    offlineMode,
    networkStatus: status,
    online: fullyOnline,
    browserOnline,
    apiOnline,
    canFlushOutbox,
    pendingSync,
    orderNumbersLeft,
    catalogReady,
    syncing,
    lastSyncMessage,
    syncProgress,
    prepare,
    flushOutbox,
    flushOutboxNow,
    syncOfflineOrders,
    refreshCounts,
    searchOffline,
  };
}
