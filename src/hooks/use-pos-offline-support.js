"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { notifyError, notifySuccess } from "@/lib/notify";
import { pingApiHealth } from "@/lib/network-status";
import {
  ensurePosOfflineOrderNumbers,
  ensurePosOfflineOwnerIsolation,
  getPosOfflineAutoRetryCount,
  getPosOfflinePendingCount,
  peekNextPosTicketNumber,
  preparePosOfflineReady,
  searchPosOfflineCatalog,
  syncPosOfflineOutbox,
  warmPosOfflineCatalog,
} from "@/lib/pos-offline";

const RETRY_BACKOFF_MS = 5_000;
const POST_SALE_FLUSH_ATTEMPTS = 8;
const POST_SALE_FLUSH_DELAY_MS = 750;

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
 * Aimed at outages up to ~1.5 hours; reconnect still flushes any leftovers.
 */
export function usePosOfflineSupport({
  enabled = false,
  floatSessionId = null,
  organizationId = null,
  userId = null,
} = {}) {
  const { status, browserOnline, apiOnline, refresh: refreshNetwork } = useNetworkStatus({
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
  const [nextPosOrderNum, setNextPosOrderNum] = useState(null);
  const [catalogReady, setCatalogReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncMessage, setLastSyncMessage] = useState(null);
  const [syncProgress, setSyncProgress] = useState(EMPTY_SYNC_PROGRESS);
  const [failedSyncOrders, setFailedSyncOrders] = useState([]);
  const wasFullyOnlineRef = useRef(fullyOnline);
  const wasCanFlushRef = useRef(canFlushOutbox);
  const canFlushRef = useRef(canFlushOutbox);
  const flushChainRef = useRef(Promise.resolve());
  const flushGenerationRef = useRef(0);
  const lastNotifiedSyncErrorRef = useRef(null);
  const manualFlushRef = useRef(false);
  const pendingFlushRef = useRef(false);

  useEffect(() => {
    canFlushRef.current = canFlushOutbox;
  }, [canFlushOutbox]);

  /** Synchronous flush gate — avoids stale canFlushRef after refreshNetwork(). */
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
      const { peekPosOfflineOrderNumberCount } = await import("@/lib/pos-offline");
      const { listFailedOutboxSales } = await import("@/lib/pos-offline");
      const [left, pending, failedRows, nextTicket] = await Promise.all([
        peekPosOfflineOrderNumberCount(),
        getPosOfflinePendingCount(),
        listFailedOutboxSales(),
        // Must match allocateLocalPosTicketNumber session scope — day-only peek
        // lagged the float-session counter and showed e.g. 14 while the till was on 32.
        peekNextPosTicketNumber(null, floatSessionId),
      ]);
      setOrderNumbersLeft(left);
      setPendingSync(pending);
      setFailedSyncOrders(failedRows);
      if (nextTicket != null) {
        setNextPosOrderNum(Number(nextTicket));
      }
      // Drop stale "complete + failed" progress once the outbox no longer has errors
      // (e.g. after Remove) so UI does not keep treating sync as failed.
      if (failedRows.length === 0) {
        setSyncProgress((prev) => {
          if (prev?.phase === "complete" && Number(prev?.failed ?? 0) > 0) {
            return { ...EMPTY_SYNC_PROGRESS, phase: "idle" };
          }
          return prev;
        });
      }
      // Queue empty — clear sticky syncing chrome immediately.
      if (pending <= 0 && failedRows.length === 0) {
        setSyncing(false);
        setLastSyncMessage(null);
        setSyncProgress({ ...EMPTY_SYNC_PROGRESS });
        pendingFlushRef.current = false;
      }
    } catch {
      /* ignore */
    }
  }, [enabled, floatSessionId]);

  /**
   * Optimistic outbox count from Pending sync UI (e.g. after Remove).
   * When the queue hits zero, hide Sync / Pending sync chrome without waiting on IDB recount.
   */
  const applyPendingOutboxCount = useCallback(
    (count) => {
      if (count == null || Number.isNaN(Number(count))) {
        void refreshCounts();
        return;
      }
      const n = Math.max(0, Number(count));
      setPendingSync(n);
      if (n <= 0) {
        setFailedSyncOrders([]);
        setLastSyncMessage(null);
        setSyncProgress({ ...EMPTY_SYNC_PROGRESS });
        setSyncing(false);
        pendingFlushRef.current = false;
      }
      void refreshCounts();
    },
    [refreshCounts],
  );

  const notifySyncProblem = useCallback((message) => {
    const key = String(message ?? "");
    if (lastNotifiedSyncErrorRef.current === key) return;
    lastNotifiedSyncErrorRef.current = key;
    notifyError(`POS sync problem — reported to platform issues. ${key}`);
  }, []);

  const prepare = useCallback(async () => {
    if (!enabled || !fullyOnline) return null;
    try {
      const ready = await preparePosOfflineReady({ floatSessionId });
      setCatalogReady(ready.catalogCount > 0);
      setOrderNumbersLeft(ready.orderNumbersAvailable);
      if (ready.nextPosOrderNum != null) {
        setNextPosOrderNum(Number(ready.nextPosOrderNum));
      }
      setPendingSync(ready.pendingSync);
      return ready;
    } catch (err) {
      console.warn("POS offline prepare failed", err);
      return null;
    }
  }, [enabled, fullyOnline, floatSessionId]);

  /**
   * Serialize outbox flushes so concurrent sells cannot double-post.
   * Safe to call fire-and-forget after every local save.
   * Runs whenever the API is reachable (including slow).
   *
   * @param {{ manual?: boolean, includeErrors?: boolean, clientSaleUuid?: string }} [options]
   *   includeErrors defaults true. Background retries pass false so a failed
   *   previous_order_edit cannot restore-to-cart / reload the order in a loop.
   *   clientSaleUuid — sync one queued sale (Pending sync popup).
   */
  const flushOutboxNow = useCallback((options = {}) => {
    if (!enabled) return Promise.resolve([]);

    const manual = Boolean(options.manual);
    const includeErrors =
      options.includeErrors != null ? Boolean(options.includeErrors) : true;
    const clientSaleUuid = options.clientSaleUuid ?? null;
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
        const results = await syncPosOfflineOutbox({
          includeErrors,
          clientSaleUuid,
          floatSessionId,
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
            // Keep the pending badge accurate while a long flush runs.
            // Failed rows remain in the outbox — do not subtract them from pending
            // or the pending-sync popup closes/reopens (and reloads) in a loop.
            // When total is 0 (e.g. only mid-edit rows), do not force pending to 0 —
            // refreshCounts after the flush is authoritative.
            if (progress.phase === "start" || progress.phase === "item_done") {
              const total = Number(progress.total ?? 0);
              if (progress.phase === "start" && total === 0) {
                return;
              }
              const remaining = Math.max(0, total - Number(progress.done ?? 0));
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
            ? ` ${reprints.length} receipt(s) need reprint (Cash Sales # changed: ${reprints
                .map((r) => {
                  const from =
                    r.printed_pos_order_num ?? "?";
                  const to = r.pos_order_num ?? "?";
                  return `#${from}→#${to}`;
                })
                .join(", ")}).`
            : "";
          setLastSyncMessage(`${base}${reprintNote}`);
          if (showProgress && !failed.length) {
            notifySuccess(base);
          }
          if (fullyOnline) {
            await warmPosOfflineCatalog({ force: true });
            await ensurePosOfflineOrderNumbers({
              force: false,
              floatSessionId,
            });
          }
        } else if (failed.length) {
          // Errored rows stay in the queue for manual Sync — do not arm the
          // zero-delay deferred flush path (that reloaded previous_order_edit).
          pendingFlushRef.current = false;
          setLastSyncMessage(
            `Could not sync ${failed.length} sale(s). Open Pending sync or tap Sync to retry.`,
          );
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
            .map((r) => {
              const ticket = r.pos_order_num ?? r.printed_pos_order_num;
              return ticket != null ? `Cash Sales #${ticket}: ${r.error}` : String(r.error ?? "Sync failed");
            })
            .join("; ");
          const more = failed.length > 3 ? ` (+${failed.length - 3} more)` : "";
          notifySyncProblem(`${detail}${more}`);
          try {
            const { listFailedOutboxSales } = await import("@/lib/pos-offline");
            setFailedSyncOrders(await listFailedOutboxSales());
          } catch {
            setFailedSyncOrders(
              failed.map((row) => ({
                id: row.client_sale_uuid ? `offline:${row.client_sale_uuid}` : null,
                order_num: row.order_num,
                pos_order_num: row.pos_order_num ?? row.printed_pos_order_num ?? null,
                offline_pending_sync: true,
                sync_error: row.error ?? null,
              })),
            );
          }
        } else if (ok.length) {
          setFailedSyncOrders([]);
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
  }, [enabled, fullyOnline, floatSessionId, refreshCounts, notifySyncProblem]);

  /**
   * After a local/outbox sale: probe API, flush the queue, retry until live or attempts exhausted.
   * Callers should await this so every completed sale reaches the server when online.
   */
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

      // Only auto-retry still-pending rows. Once marked error (e.g. previous_order_edit),
      // stop — further attempts would reload restore-to-cart in a loop.
      lastResults = await flushOutboxNow({ includeErrors: false });
      await refreshCounts();

      const pending = await getPosOfflinePendingCount();
      const autoRetry = await getPosOfflineAutoRetryCount();
      const failed = lastResults.filter((row) => !row.ok);

      if (pending === 0 && failed.length === 0) {
        pendingFlushRef.current = false;
        return { ok: true, results: lastResults, pending: 0 };
      }

      if (autoRetry === 0) {
        pendingFlushRef.current = false;
        return {
          ok: false,
          results: lastResults,
          pending,
          failed,
        };
      }

      if (failed.length > 0 || pending > 0) {
        pendingFlushRef.current = true;
      }

      if (attempt < POST_SALE_FLUSH_ATTEMPTS - 1) {
        await new Promise((resolve) => {
          window.setTimeout(resolve, POST_SALE_FLUSH_DELAY_MS * (attempt + 1));
        });
      }
    }

    const pending = await getPosOfflinePendingCount();
    const failed = lastResults.filter((row) => !row.ok);
    const ok = pending === 0 && failed.length === 0;
    if (!ok) {
      pendingFlushRef.current = false;
    }
    return {
      ok,
      results: lastResults,
      pending,
      failed,
    };
  }, [enabled, flushOutboxNow, probeCanFlushOutbox, refreshCounts, refreshNetwork]);

  const beginManualOutboxSync = useCallback(
    async ({ clientSaleUuid = null, startMessage = "Checking local offline orders…" } = {}) => {
      if (!enabled) return [];
      await refreshCounts();
      const canFlush = await probeCanFlushOutbox();
      if (!canFlush) {
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
        message: startMessage,
      });
      setLastSyncMessage(startMessage);
      return flushOutboxNow({
        manual: true,
        ...(clientSaleUuid ? { clientSaleUuid } : {}),
      });
    },
    [enabled, flushOutboxNow, probeCanFlushOutbox, refreshCounts],
  );

  /** Manual Sync button — same flush path, with progress + toast feedback. */
  const syncOfflineOrders = useCallback(async () => {
    return beginManualOutboxSync();
  }, [beginManualOutboxSync]);

  /** Sync one queued offline sale from the Pending sync popup. */
  const syncSingleOfflineOrder = useCallback(
    async (clientSaleUuid) => {
      const uuid = String(clientSaleUuid ?? "").trim();
      if (!uuid) return [];
      return beginManualOutboxSync({
        clientSaleUuid: uuid,
        startMessage: "Syncing offline order…",
      });
    },
    [beginManualOutboxSync],
  );

  /** @deprecated prefer flushOutboxNow — kept for reconnect callers */
  const flushOutbox = flushOutboxNow;

  useEffect(() => {
    if (!enabled) return undefined;
    void prepare();
    void refreshCounts();
  }, [enabled, prepare, refreshCounts]);

  // Finish an incomplete Z wipe if needed; do not wipe solely on cashier change.
  useEffect(() => {
    if (!enabled || !userId || !organizationId) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const result = await ensurePosOfflineOwnerIsolation({
          organizationId,
          userId,
        });
        if (cancelled) return;
        if (result.wiped) {
          await refreshCounts();
          await prepare();
        }
      } catch (err) {
        console.warn("POS offline owner isolation failed", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, organizationId, userId, prepare, refreshCounts]);

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

  // Retry still-pending outbox rows while API is reachable. Skip sync_status=error
  // so a stuck previous_order_edit cannot restore-to-cart / flicker Pending sync.
  useEffect(() => {
    if (!enabled || !canFlushOutbox || syncing) return undefined;
    if (pendingSync <= 0) {
      pendingFlushRef.current = false;
      return undefined;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        const autoRetry = await getPosOfflineAutoRetryCount();
        if (cancelled || autoRetry <= 0) {
          pendingFlushRef.current = false;
          return;
        }
        pendingFlushRef.current = false;
        void flushOutboxNow({ includeErrors: false });
      })();
    }, RETRY_BACKOFF_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
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
    nextPosOrderNum,
    catalogReady,
    syncing,
    lastSyncMessage,
    syncProgress,
    failedSyncOrders,
    prepare,
    flushOutbox,
    flushOutboxNow,
    flushOutboxAfterSale,
    syncOfflineOrders,
    syncSingleOfflineOrder,
    refreshCounts,
    applyPendingOutboxCount,
    refreshNetwork,
    searchOffline,
  };
}
