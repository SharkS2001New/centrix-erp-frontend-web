"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiRequest } from "@/lib/api";
import { mapWithConcurrency } from "@/lib/api-concurrency";
import { formatShortDate, INPUT_CLASS, TABLE_HEAD_ROW_CLASS, workspaceCardClassName } from "@/components/catalog/catalog-shared";
import {
  saleLineDisplayUnitPrice,
  saleLineProductLabel,
  saleLineQtyLabel,
} from "@/lib/sale-line-items";
import { formatReceiptNumber, formatSaleKes } from "@/components/sales/sales-shared";
import { OrderExpandIcon } from "@/components/sales/sales-orders-shared";
import { saleCustomerLabel } from "@/lib/sales";

function orderKey(order) {
  return String(order?.id ?? "");
}

function heldOrderTitle(order) {
  return `${formatReceiptNumber(order)} - ${saleCustomerLabel(order)}`;
}

function indexSalesWithItems(list) {
  const map = {};
  for (const sale of list ?? []) {
    if (sale?.items?.length) {
      map[orderKey(sale)] = sale;
    }
  }
  return map;
}

export function PosHeldOrdersOverlay({ open, onClose, onRestored, onCountChange }) {
  const [mounted, setMounted] = useState(false);
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState(null);
  const [search, setSearch] = useState("");
  const [detailsById, setDetailsById] = useState({});
  const [detailLoadingId, setDetailLoadingId] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busyOrderId, setBusyOrderId] = useState(null);
  const [uomById, setUomById] = useState(() => new Map());

  useEffect(() => {
    setMounted(true);
  }, []);

  const loadUoms = useCallback(async () => {
    try {
      const res = await apiRequest("/uoms", { searchParams: { per_page: 500 } });
      const map = new Map();
      for (const u of res.data ?? []) {
        if (u?.id != null) map.set(u.id, u);
      }
      setUomById(map);
    } catch {
      setUomById(new Map());
    }
  }, []);

  const loadHeldOrders = useCallback(async () => {
    setListError(null);
    setLoading(true);
    try {
      const res = await apiRequest("/sales", {
        searchParams: {
          per_page: 200,
          with_items: 1,
          "filter[status]": "held",
        },
      });
      const list = res.data ?? [];
      const count = Number(res.total ?? list.length);
      setRows(list);
      setTotalCount(count);
      setDetailsById(indexSalesWithItems(list));
      onCountChange?.(count);

      const missing = list.filter((sale) => !sale?.items?.length);
      if (missing.length) {
        const loaded = await mapWithConcurrency(
          missing,
          (sale) => apiRequest(`/sales/${sale.id}`).catch(() => null),
          3,
        );
        setDetailsById((prev) => {
          const next = { ...prev };
          for (const sale of loaded) {
            if (sale?.id) next[orderKey(sale)] = sale;
          }
          return next;
        });
      }
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load held orders");
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    if (!open) {
      setDetailsById({});
      setSearch("");
      setListError(null);
      setActionError(null);
      setDetailLoadingId(null);
      setBusyOrderId(null);
      return;
    }
    void loadUoms();
    loadHeldOrders();
  }, [open, loadHeldOrders, loadUoms]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((s) => {
      const receipt = formatReceiptNumber(s).toLowerCase();
      const customer = saleCustomerLabel(s).toLowerCase();
      const orderNum = String(s.order_num ?? "");
      return receipt.includes(q) || customer.includes(q) || orderNum.includes(q);
    });
  }, [rows, search]);

  async function loadOrderDetail(orderId) {
    const key = String(orderId);
    if (detailsById[key]?.items?.length) return detailsById[key];
    setDetailLoadingId(key);
    setActionError(null);
    try {
      const sale = await apiRequest(`/sales/${orderId}`);
      setDetailsById((prev) => ({ ...prev, [key]: sale }));
      return sale;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to load order items");
      return null;
    } finally {
      setDetailLoadingId(null);
    }
  }

  function handleDetailsToggle(order, event) {
    if (event.currentTarget.open) {
      void loadOrderDetail(order.id);
    }
  }

  async function handleRestore(order, replace = false) {
    if (!order?.id) return;
    setBusyOrderId(order.id);
    setActionError(null);
    try {
      const cart = await apiRequest(`/sales/orders/${order.id}/restore-to-cart`, {
        method: "POST",
        body: { replace },
      });
      onRestored?.(cart);
      onClose?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to restore order";
      if (!replace && message.toLowerCase().includes("already has items")) {
        const ok = window.confirm(
          "Your cart already has items. Replace them with this held order?",
        );
        if (ok) {
          setBusyOrderId(null);
          return handleRestore(order, true);
        }
      } else {
        setActionError(message);
      }
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleDelete(order) {
    if (!order?.id) return;
    const label = heldOrderTitle(order);
    const ok = window.confirm(`Delete held order ${label}? This cannot be undone.`);
    if (!ok) return;

    setBusyOrderId(order.id);
    setActionError(null);
    try {
      await apiRequest(`/sales/orders/${order.id}/cancel-held`, { method: "POST" });
      const key = orderKey(order);
      setRows((prev) => prev.filter((row) => orderKey(row) !== key));
      setDetailsById((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      const nextCount = Math.max(0, totalCount - 1);
      setTotalCount(nextCount);
      onCountChange?.(nextCount);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete held order");
    } finally {
      setBusyOrderId(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(e) {
      if (e.key === "Escape" && !busyOrderId) onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, busyOrderId]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => {
        if (!busyOrderId) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="held-orders-title"
        className="flex h-[min(88vh,860px)] w-[min(98vw,72rem)] flex-col overflow-hidden theme-panel rounded-xl border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-[var(--theme-primary-hover)] bg-[var(--theme-primary)] px-4 py-3 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 id="held-orders-title" className="text-base font-semibold tracking-tight">
                  Held orders
                </h2>
                {totalCount > 0 ? (
                  <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-white/20 px-2 py-0.5 text-xs font-bold">
                    {totalCount}
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 text-xs text-blue-100">
                Review parked sales and restore them to the till when ready.
              </p>
            </div>
            <button
              type="button"
              disabled={Boolean(busyOrderId)}
              onClick={onClose}
              className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-white/20 disabled:opacity-50"
            >
              Close
            </button>
          </div>
        </header>

        <div className="shrink-0 theme-table-head-row border-b px-4 py-2.5">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order #, customer…"
            className={INPUT_CLASS}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50">
          {loading ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">Loading held orders…</p>
          ) : listError ? (
            <p className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {listError}
            </p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <p className="text-sm font-medium text-slate-700">No held orders</p>
              <p className="mt-1 text-sm text-slate-500">
                Use Hold on the cart to park a sale for later.
              </p>
            </div>
          ) : (
            <ul className="space-y-2 p-3">
            {filtered.map((order, index) => {
              const key = orderKey(order);
              const detail = detailsById[key] ?? order;
              const items = detail?.items ?? [];
              const isBusy = busyOrderId === order.id;
              const isLoadingItems = detailLoadingId === key;

              return (
                <li
                  key={key}
                  className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm"
                >
                  <details
                    open={index === 0}
                    className="group w-full"
                    onToggle={(e) => handleDetailsToggle(order, e)}
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
                      <OrderExpandIcon />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-900">
                          {heldOrderTitle(order)}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {formatShortDate(order.created_at)}
                        </span>
                      </span>
                      <span className="shrink-0 text-sm font-semibold text-[var(--theme-accent-text)]">
                        {formatSaleKes(order.order_total)}
                      </span>
                    </summary>

                    <div className="w-full border-t border-slate-200 bg-slate-50/50">
                      {isLoadingItems ? (
                        <p className="px-4 py-3 text-xs text-slate-500">Loading items…</p>
                      ) : items.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-slate-500">No line items on this order.</p>
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
                            {items.map((line) => (
                              <tr
                                key={line.id ?? `${line.product_code}-${line.line_no}`}
                                className="border-b border-slate-100 last:border-b-0"
                              >
                                <td className="px-4 py-2.5 text-slate-800">
                                  {saleLineProductLabel(line)}
                                  {line.on_wholesale_retail ? (
                                    <span className="ml-1.5 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-800">
                                      Retail
                                    </span>
                                  ) : null}
                                </td>
                                <td className="px-4 py-2.5 text-center text-slate-700">
                                  {saleLineQtyLabel(line, uomById)}
                                </td>
                                <td className="px-4 py-2.5 text-right text-slate-700">
                                  {formatSaleKes(saleLineDisplayUnitPrice(line, uomById))}
                                </td>
                                <td className="px-4 py-2.5 text-right font-medium text-slate-900">
                                  {formatSaleKes(line.amount)}
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
                        disabled={Boolean(busyOrderId)}
                        onClick={(e) => {
                          e.preventDefault();
                          void handleRestore(order, false);
                        }}
                        className="rounded-md bg-[var(--theme-primary)] px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-white hover:bg-[var(--theme-primary-hover)] disabled:opacity-50"
                      >
                        {isBusy ? "…" : "Restore"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyOrderId)}
                        onClick={(e) => {
                          e.preventDefault();
                          void handleDelete(order);
                        }}
                        className="rounded-md border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-700 hover:bg-red-100 disabled:opacity-50"
                      >
                        Delete
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
    document.body,
  );
}
