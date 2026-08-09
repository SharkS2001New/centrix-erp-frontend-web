"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { posModalOverlayClass, posModalPanelClass, renderPosModalPortal } from "@/lib/pos-modal-shell";
import { formatShortDate, INPUT_CLASS, TABLE_HEAD_ROW_CLASS } from "@/components/catalog/catalog-shared";
import {
  saleLineSoldUnitPrice,
  saleLineListRowAmount,
  saleLineProductLabel,
  saleLineQtyLabel,
} from "@/lib/sale-line-items";
import { formatSaleKes } from "@/components/sales/sales-shared";
import { formatPosBrowseLabel } from "@/lib/sales";
import { OrderExpandIcon } from "@/components/sales/sales-orders-shared";
import { PosOfflineSyncControls } from "@/components/sales/pos-offline-sync-controls";
import { useConfirm } from "@/lib/use-confirm";
import { fetchUomsCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import {
  discardOutboxSale,
  discardAllPendingOutboxSales,
  listPendingOutboxSalesForManage,
} from "@/lib/pos-offline";

function orderKey(order) {
  return String(order?.client_sale_uuid ?? order?.id ?? "");
}

/** External POS only — Cash Sales # / pos_order_num, never org S# / order_num. */
function pendingSyncTitle(order) {
  const label = formatPosBrowseLabel(order);
  const customer = order.customer_name ?? order.customer_name_override ?? "Walk-in";
  return label !== "—" ? `${label} — ${customer}` : customer;
}

function syncStatusLabel(order) {
  if (order.sync_status === "error") return "Sync failed";
  if (order.sync_status === "editing") return "Open for edit";
  if (order.sync_status === "syncing") return "Uploading…";
  if (order.sync_status === "pending") return "Waiting to sync";
  return String(order.sync_status ?? "Queued");
}

export function PosPendingSyncOverlay({
  open,
  onClose,
  onCountChange,
  onDiscarded,
  embedded = false,
  syncing = false,
  canFlush = false,
  syncProgress = null,
  lastSyncMessage = null,
  onSyncAll,
  onSyncOrder,
  onPrintAll,
}) {
  const confirm = useConfirm();
  const { user } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [listError, setListError] = useState(null);
  const [search, setSearch] = useState("");
  const [actionError, setActionError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [printingAll, setPrintingAll] = useState(false);
  const [uomById, setUomById] = useState(() => new Map());
  const onCountChangeRef = useRef(onCountChange);
  const loadedOnceRef = useRef(false);
  const wasSyncingRef = useRef(false);

  useEffect(() => {
    onCountChangeRef.current = onCountChange;
  }, [onCountChange]);

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadUoms = useCallback(async () => {
    try {
      const uoms = await fetchUomsCached(user?.organization_id);
      const map = new Map();
      for (const u of uoms ?? []) {
        if (u?.id != null) map.set(u.id, u);
      }
      setUomById(map);
    } catch {
      setUomById(new Map());
    }
  }, [user?.organization_id]);

  const loadPendingSales = useCallback(async ({ refresh = false } = {}) => {
    setListError(null);
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const list = await listPendingOutboxSalesForManage();
      setRows(list);
      onCountChangeRef.current?.(list.length);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load pending offline orders");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (wasSyncingRef.current && !syncing && open) {
      void loadPendingSales({ refresh: true });
    }
    wasSyncingRef.current = syncing;
  }, [syncing, open, loadPendingSales]);

  useEffect(() => {
    if (!open) {
      loadedOnceRef.current = false;
      setSearch("");
      setListError(null);
      setActionError(null);
      setBusyKey(null);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (loadedOnceRef.current) return;
    loadedOnceRef.current = true;
    void loadUoms();
    void loadPendingSales();
  }, [open, loadPendingSales, loadUoms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((order) => {
      const ticket = formatPosBrowseLabel(order).toLowerCase();
      const customer = String(order.customer_name ?? order.customer_name_override ?? "").toLowerCase();
      const posNum = String(order.pos_order_num ?? "");
      const err = String(order.sync_error ?? "").toLowerCase();
      return ticket.includes(q) || customer.includes(q) || posNum.includes(q) || err.includes(q);
    });
  }, [rows, search]);

  async function handleSyncOrder(order) {
    const uuid = order?.client_sale_uuid;
    if (!uuid || !onSyncOrder) return;
    const key = orderKey(order);
    setBusyKey(key);
    setActionError(null);
    try {
      const results = await onSyncOrder(uuid);
      const failed = (results ?? []).find((row) => !row.ok);
      if (failed?.error) {
        setActionError(failed.error);
      }
      await loadPendingSales({ refresh: true });
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to sync offline order");
      await loadPendingSales({ refresh: true }).catch(() => {});
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDiscard(order) {
    const uuid = order?.client_sale_uuid;
    if (!uuid) return;
    const label = pendingSyncTitle(order);
    const ok = await confirm({
      title: "Remove offline order",
      message: `Remove ${label} from the local sync queue? The receipt was already printed locally — only use this if the sale did not reach the server and you need to sell again.`,
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!ok) return;

    const key = orderKey(order);
    setBusyKey(key);
    setActionError(null);
    try {
      await discardOutboxSale(uuid);
      let remaining = 0;
      setRows((prev) => {
        const next = prev.filter((row) => orderKey(row) !== key);
        remaining = next.length;
        onCountChangeRef.current?.(remaining);
        return next;
      });
      onDiscarded?.(order);
      // Empty queue — dismiss so Close is not left fighting an auto-reopen effect.
      if (remaining <= 0) {
        onClose?.();
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to remove offline order");
    } finally {
      setBusyKey(null);
    }
  }

  async function handleDiscardAll() {
    if (rows.length <= 0) return;
    const ok = await confirm({
      title: "Delete all pending offline orders",
      message: `Remove all ${rows.length} pending offline order${rows.length === 1 ? "" : "s"} from this device? Receipts already printed stay local only — they will not upload to the server. This cannot be undone.`,
      confirmLabel: "Delete all",
      destructive: true,
    });
    if (!ok) return;

    setBusyKey("__all__");
    setActionError(null);
    try {
      const result = await discardAllPendingOutboxSales();
      await loadPendingSales({ refresh: true });
      onDiscarded?.({ deleted: result?.deleted ?? 0 });
      if ((result?.deleted ?? 0) > 0 && (result?.skippedSyncing ?? 0) <= 0) {
        onClose?.();
      } else if ((result?.skippedSyncing ?? 0) > 0) {
        setActionError(
          `Removed ${result.deleted}. ${result.skippedSyncing} still syncing — try again in a moment.`,
        );
      }
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to remove pending offline orders");
      await loadPendingSales({ refresh: true }).catch(() => {});
    } finally {
      setBusyKey(null);
    }
  }

  async function handlePrintAll() {
    if (!onPrintAll || rows.length <= 0 || printingAll) return;
    setPrintingAll(true);
    setActionError(null);
    try {
      // Prefer the visible filtered list when searching; otherwise all pending rows.
      const toPrint = filtered.length > 0 && search.trim() ? filtered : rows;
      await onPrintAll(toPrint);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to print pending receipts");
    } finally {
      setPrintingAll(false);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return renderPosModalPortal(
    <div className={`${posModalOverlayClass(embedded)}${embedded ? "" : " bg-black/40"}`}>
      {!embedded ? (
        <button
          type="button"
          className="absolute inset-0 z-0"
          aria-label="Close"
          onClick={() => onClose?.()}
        />
      ) : null}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pending-sync-title"
        className={`${posModalPanelClass(embedded, "relative z-10 flex h-[min(88vh,860px)] w-[min(98vw,72rem)] flex-col overflow-hidden theme-panel rounded-xl border shadow-2xl")}`}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="classic-pos-themed-dialog-header shrink-0 border-b border-amber-700 bg-amber-600 px-4 py-3 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 id="pending-sync-title" className="text-base font-semibold tracking-tight">
                  Pending offline sync
                </h2>
                {rows.length > 0 ? (
                  <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
                    {rows.length}
                  </span>
                ) : null}
              </div>
              <p className="classic-pos-themed-dialog-sub mt-0.5 text-xs text-amber-100">
                Local sales waiting to upload. Sync or remove a stuck order here — you can keep selling; new orders use the next Cash Sales #.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={
                Boolean(busyKey) ||
                loading ||
                refreshing ||
                printingAll ||
                rows.length === 0 ||
                !onPrintAll
              }
              onClick={() => void handlePrintAll()}
              className="rounded-lg border border-white/30 bg-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-white/25 disabled:opacity-50"
              title="Print receipts for all pending offline orders"
            >
              {printingAll
                ? "Printing…"
                : rows.length > 0
                  ? `Print all (${rows.length})`
                  : "Print all"}
            </button>
            <button
              type="button"
              disabled={Boolean(busyKey) || loading || refreshing || printingAll || rows.length === 0 || syncing}
              onClick={() => void handleDiscardAll()}
              className="rounded-lg border border-red-300/80 bg-red-600/90 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-red-600 disabled:opacity-50"
            >
              {busyKey === "__all__" ? "Deleting…" : "Delete all"}
            </button>
            <button
              type="button"
              disabled={Boolean(busyKey) || loading || refreshing || printingAll}
              onClick={() => void loadPendingSales({ refresh: true })}
              className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-white/20 disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button
              type="button"
              onClick={() => onClose?.()}
              className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-white/20"
            >
              Close
            </button>
            </div>
          </div>
        </header>

        {rows.length > 0 ? (
          <div className="shrink-0 border-b border-sky-200 bg-sky-50 px-4 py-2.5">
            <PosOfflineSyncControls
              pendingSync={rows.length}
              syncing={syncing}
              canFlush={canFlush}
              syncProgress={syncProgress}
              lastSyncMessage={lastSyncMessage}
              onSync={() => void onSyncAll?.()}
            />
          </div>
        ) : null}

        <div className="shrink-0 theme-table-head-row border-b px-4 py-2.5">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer, or error…"
            className={INPUT_CLASS}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50">
          {loading && rows.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Loading pending orders…</p>
          ) : listError ? (
            <p className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {listError}
            </p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No pending offline orders</p>
              <p className="mt-1 text-sm text-slate-500">
                Completed local sales appear here until they sync to the server.
              </p>
            </div>
          ) : (
            <ul className="space-y-2 p-3">
              {filtered.map((order) => {
                const key = orderKey(order);
                const items = order.items ?? [];
                const isBusy = busyKey === key;
                const failed = order.sync_status === "error";

                return (
                  <li
                    key={key}
                    className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm"
                  >
                    <details className="group w-full">
                      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
                        <OrderExpandIcon />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-slate-900">
                            {pendingSyncTitle(order)}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>{formatShortDate(order.created_at)}</span>
                            <span
                              className={`rounded px-1.5 py-0.5 font-semibold uppercase tracking-wide ${
                                failed
                                  ? "bg-red-100 text-red-800"
                                  : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              {syncStatusLabel(order)}
                            </span>
                            {order.sync_kind === "previous_order_edit" ? (
                              <span className="rounded bg-sky-100 px-1.5 py-0.5 font-semibold uppercase tracking-wide text-sky-900">
                                Previous order edit
                              </span>
                            ) : null}
                          </span>
                          {failed && order.sync_error ? (
                            <span className="mt-1 block text-xs text-red-700">{order.sync_error}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-[var(--theme-accent-text)]">
                          {formatSaleKes(order.order_total)}
                        </span>
                      </summary>

                      <div className="w-full border-t border-slate-200 bg-slate-50/50">
                        {items.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-slate-500">No line items stored for this sale.</p>
                        ) : (
                          <table className="w-full border-collapse text-sm">
                            <thead>
                              <tr className={`${TABLE_HEAD_ROW_CLASS} text-[10px] font-semibold`}>
                                <th className="px-4 py-2">Product</th>
                                <th className="px-4 py-2 text-center">Qty</th>
                                <th className="px-4 py-2 text-right">Price</th>
                                <th className="px-4 py-2 text-right">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {items.map((line, index) => (
                                <tr
                                  key={line.id ?? `${line.product_code}-${index}`}
                                  className="border-b border-slate-100 last:border-b-0"
                                >
                                  <td className="px-4 py-2.5 text-slate-800">
                                    {saleLineProductLabel(line)}
                                  </td>
                                  <td className="px-4 py-2.5 text-center text-slate-700">
                                    {saleLineQtyLabel(line, uomById)}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-slate-700">
                                    {formatSaleKes(saleLineSoldUnitPrice(line, uomById))}
                                  </td>
                                  <td className="px-4 py-2.5 text-right font-medium text-slate-900">
                                    {formatSaleKes(saleLineListRowAmount(line, uomById))}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      <div className="flex justify-end gap-2 border-t border-slate-200 bg-white px-3 py-2">
                        <button
                          type="button"
                          disabled={Boolean(busyKey) || syncing || !canFlush || !onSyncOrder}
                          onClick={(e) => {
                            e.preventDefault();
                            void handleSyncOrder(order);
                          }}
                          className="rounded-md border border-sky-200 bg-sky-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-800 hover:bg-sky-100 disabled:opacity-50"
                        >
                          {isBusy ? "Syncing…" : "Sync order"}
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyKey) || syncing}
                          onClick={(e) => {
                            e.preventDefault();
                            void handleDiscard(order);
                          }}
                          className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-700 hover:bg-red-100 disabled:opacity-50"
                        >
                          {isBusy && !syncing ? "…" : "Remove"}
                        </button>
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {actionError ? (
          <p className="shrink-0 border-t border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {actionError}
          </p>
        ) : null}
      </div>
    </div>,
  );
}
