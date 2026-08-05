"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { notifyError, notifySuccess } from "@/lib/notify";
import { pingApiHealth } from "@/lib/network-status";
import {
  ensureHotelPosOfflineCheckNumbers,
  getHotelPosOfflinePendingCount,
  prepareHotelPosOfflineReady,
  syncHotelPosOfflineOutbox,
  warmHotelPosOfflineCatalog,
} from "@/lib/hotel-pos-offline";

const POST_SALE_FLUSH_ATTEMPTS = 8;
const POST_SALE_FLUSH_DELAY_MS = 750;

const EMPTY_SYNC_PROGRESS = {
  phase: "idle",
  current: 0,
  total: 0,
  done: 0,
  failed: 0,
  check_number: null,
  message: null,
};

/**
 * Hotel & Bar POS short-outage bridge (same idea as External POS offline).
 * Cash-only local tickets when offline/slow; flush outbox when API is reachable.
 */
export function useHotelPosOfflineSupport({ enabled = true, outletId = null } = {}) {
  const { status, browserOnline, apiOnline, refresh: refreshNetwork } = useNetworkStatus({
    enabled,
    reportOutages: false,
  });
  const fullyOnline = status === "online";
  const canFlushOutbox = enabled && browserOnline && apiOnline;
  const offlineMode = enabled && status !== "online";
  const [pendingSync, setPendingSync] = useState(0);
  const [checkNumbersLeft, setCheckNumbersLeft] = useState(0);
  const [catalogReady, setCatalogReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState(null);
  const [syncProgress, setSyncProgress] = useState(EMPTY_SYNC_PROGRESS);
  const canFlushRef = useRef(canFlushOutbox);
  const flushChainRef = useRef(Promise.resolve());
  const flushGenerationRef = useRef(0);
  const manualFlushRef = useRef(false);
  const pendingFlushRef = useRef(false);
  const lastNotifiedSyncErrorRef = useRef(null);
  const outletIdRef = useRef(outletId);

  useEffect(() => {
    outletIdRef.current = outletId;
  }, [outletId]);

  useEffect(() => {
    canFlushRef.current = canFlushOutbox;
  }, [canFlushOutbox]);

  const probeCanFlushOutbox = useCallback(async () => {
    const browserOk = typeof navigator === "undefined" ? true : navigator.onLine;
    if (!browserOk) {
      canFlushRef.current = false;
      return false;
    }
    const result = await pingApiHealth();
    const canFlush = enabled && browserOk && result.ok;
    canFlushRef.current = canFlush;
    return canFlush;
  }, [enabled]);

  const refreshCounts = useCallback(async () => {
    if (!enabled) return;
    try {
      const { peekHotelPosOfflineCheckNumberCount, listFailedHotelOutboxChecks } = await import(
        "@/lib/hotel-pos-offline"
      );
      const [left, pending] = await Promise.all([
        peekHotelPosOfflineCheckNumberCount(),
        getHotelPosOfflinePendingCount(),
      ]);
      setCheckNumbersLeft(left);
      setPendingSync(pending);
      void listFailedHotelOutboxChecks;
    } catch {
      /* ignore */
    }
  }, [enabled]);

  const notifySyncProblem = useCallback((message) => {
    const key = String(message ?? "");
    if (lastNotifiedSyncErrorRef.current === key) return;
    lastNotifiedSyncErrorRef.current = key;
    notifyError(`Hotel POS sync problem — ${key}`);
  }, []);

  const prepare = useCallback(async () => {
    if (!enabled || !fullyOnline) return null;
    try {
      const ready = await prepareHotelPosOfflineReady({
        outletId: outletIdRef.current,
      });
      setCatalogReady(ready.catalogCount > 0);
      setCheckNumbersLeft(ready.checkNumbersAvailable);
      setPendingSync(ready.pendingSync);
      return ready;
    } catch (err) {
      console.warn("Hotel POS offline prepare failed", err);
      return null;
    }
  }, [enabled, fullyOnline, outletId]);

  const flushOutboxNow = useCallback(
    (options = {}) => {
      if (!enabled) return Promise.resolve([]);

      const manual = Boolean(options.manual);
      const includeErrors =
        options.includeErrors != null ? Boolean(options.includeErrors) : true;
      if (manual) manualFlushRef.current = true;

      const generation = ++flushGenerationRef.current;
      const run = async () => {
        if (!canFlushRef.current) {
          pendingFlushRef.current = true;
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
        pendingFlushRef.current = false;
        setSyncing(true);
        const showProgress = manualFlushRef.current;
        try {
          const results = await syncHotelPosOfflineOutbox({
            includeErrors,
            onProgress: (progress) => {
              setSyncProgress({
                phase: progress.phase ?? "syncing",
                current: Number(progress.current ?? 0),
                total: Number(progress.total ?? 0),
                done: Number(progress.done ?? 0),
                failed: Number(progress.failed ?? 0),
                check_number: progress.check_number ?? null,
                message: progress.message ?? null,
              });
              if (progress.message) setLastSyncMessage(progress.message);
              if (progress.phase === "start" || progress.phase === "item_done") {
                const remaining = Math.max(
                  0,
                  Number(progress.total ?? 0) - Number(progress.done ?? 0),
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
          if (ok.length) {
            lastNotifiedSyncErrorRef.current = null;
            const base = failed.length
              ? `Synced ${ok.length} check(s); ${failed.length} failed.`
              : `Synced ${ok.length} check(s).`;
            setLastSyncMessage(base);
            if (showProgress && !failed.length) notifySuccess(base);
            if (fullyOnline) {
              await warmHotelPosOfflineCatalog({
                force: true,
                outletId: outletIdRef.current,
                warmImages: true,
              });
              await ensureHotelPosOfflineCheckNumbers({ force: false });
            }
          } else if (failed.length) {
            pendingFlushRef.current = false;
            setLastSyncMessage(
              `Could not sync ${failed.length} check(s). Tap Sync to retry.`,
            );
          } else if (showProgress) {
            setLastSyncMessage("No offline checks waiting to sync.");
            notifySuccess("No offline checks waiting to sync.");
          }
          if (failed.length) {
            const detail = failed
              .slice(0, 3)
              .map((r) => `#${r.check_number}: ${r.error}`)
              .join("; ");
            notifySyncProblem(detail);
          }
          await refreshCounts();
          return results;
        } catch (err) {
          const message = err?.message ?? "Could not sync offline checks.";
          setLastSyncMessage(message);
          setSyncProgress({ ...EMPTY_SYNC_PROGRESS, phase: "error", message });
          notifySyncProblem(message);
          await refreshCounts();
          return [];
        } finally {
          manualFlushRef.current = false;
          if (generation === flushGenerationRef.current) {
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
    },
    [enabled, fullyOnline, refreshCounts, notifySyncProblem],
  );

  const flushOutboxAfterSale = useCallback(async () => {
    if (!enabled) return { ok: true, results: [] };

    await refreshCounts();
    let lastResults = [];

    for (let attempt = 0; attempt < POST_SALE_FLUSH_ATTEMPTS; attempt += 1) {
      await refreshNetwork();
      const canFlush = await probeCanFlushOutbox();
      if (!canFlush) {
        pendingFlushRef.current = true;
        if (attempt < POST_SALE_FLUSH_ATTEMPTS - 1) {
          await new Promise((resolve) => {
            window.setTimeout(resolve, POST_SALE_FLUSH_DELAY_MS * (attempt + 1));
          });
          continue;
        }
        break;
      }

      lastResults = await flushOutboxNow({ includeErrors: false });
      await refreshCounts();
      const pending = await getHotelPosOfflinePendingCount();
      const failed = lastResults.filter((row) => !row.ok);
      if (pending === 0 && failed.length === 0) {
        pendingFlushRef.current = false;
        return { ok: true, results: lastResults, pending: 0 };
      }
      if (attempt < POST_SALE_FLUSH_ATTEMPTS - 1) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, POST_SALE_FLUSH_DELAY_MS * (attempt + 1));
        });
      }
    }

    const pending = await getHotelPosOfflinePendingCount();
    const failed = lastResults.filter((row) => !row.ok);
    return {
      ok: pending === 0 && failed.length === 0,
      results: lastResults,
      pending,
      failed,
    };
  }, [enabled, flushOutboxNow, probeCanFlushOutbox, refreshCounts, refreshNetwork]);

  const syncOfflineChecks = useCallback(async () => {
    if (!enabled) return [];
    await refreshCounts();
    const canFlush = await probeCanFlushOutbox();
    if (!canFlush) {
      const message = "Cannot sync while offline. Reconnect, then try again.";
      setLastSyncMessage(message);
      notifyError(message);
      return [];
    }
    return flushOutboxNow({ manual: true });
  }, [enabled, flushOutboxNow, probeCanFlushOutbox, refreshCounts]);

  useEffect(() => {
    if (!enabled) return undefined;
    void prepare();
    void refreshCounts();
  }, [enabled, prepare, refreshCounts]);

  useEffect(() => {
    if (!enabled || !canFlushOutbox) return undefined;
    void flushOutboxNow({ includeErrors: false });
  }, [enabled, canFlushOutbox, flushOutboxNow]);

  useEffect(() => {
    if (!enabled || !fullyOnline) return undefined;
    const timer = window.setInterval(() => {
      void warmHotelPosOfflineCatalog({
        force: false,
        outletId: outletIdRef.current,
        warmImages: true,
      });
      void ensureHotelPosOfflineCheckNumbers({ force: false });
      void refreshCounts();
    }, 5 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [enabled, fullyOnline, refreshCounts, outletId]);

  return {
    status,
    fullyOnline,
    canFlushOutbox,
    offlineMode,
    pendingSync,
    checkNumbersLeft,
    catalogReady,
    syncing,
    lastSyncMessage,
    syncProgress,
    refreshNetwork,
    refreshCounts,
    prepare,
    flushOutboxNow,
    flushOutboxAfterSale,
    syncOfflineChecks,
  };
}
