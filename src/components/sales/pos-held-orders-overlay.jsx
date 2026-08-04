"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { posModalOverlayClass, posModalPanelClass, renderPosModalPortal } from "@/lib/pos-modal-shell";
import { apiRequest } from "@/lib/api";
import { formatShortDate, INPUT_CLASS, TABLE_HEAD_ROW_CLASS } from "@/components/catalog/catalog-shared";
import {
  saleLineSoldUnitPrice,
  saleLineListRowAmount,
  saleLineProductLabel,
  saleLineQtyLabel,
} from "@/lib/sale-line-items";
import { formatReceiptNumber, formatSaleKes } from "@/components/sales/sales-shared";
import { OrderExpandButton } from "@/components/sales/sales-orders-shared";
import { saleCustomerLabel } from "@/lib/sales";
import { useConfirm } from "@/lib/use-confirm";
import { fetchUomsCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import {
  deleteLocalHeldOrder,
  getLocalHeldOrder,
  isLocalHeldId,
  listLocalHeldOrders,
  restoreLocalHeldOrder,
} from "@/lib/pos-local-held";

function orderKey(order) {
  return String(order?.id ?? "");
}

function heldOrderLabel(order) {
  if (order?.local_held || isLocalHeldId(order?.id)) {
    return order.hold_label || "HOLD";
  }
  return formatReceiptNumber(order);
}

function heldCustomerName(order) {
  return (
    saleCustomerLabel(order) ||
    order?.customer_name ||
    order?.customer_name_override ||
    order?.customer?.customer_name ||
    "Walk-in"
  );
}

function heldOrderTitle(order) {
  return `${heldOrderLabel(order)} - ${heldCustomerName(order)}`;
}

export function PosHeldOrdersOverlay({
  open,
  onClose,
  onRestored,
  onRestoreFailed,
  onCountChange,
  embedded = false,
  workspaceHasLines = false,
  cartSeed = null,
}) {
  const confirm = useConfirm();
  const { user } = useAuth();
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
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [uomById, setUomById] = useState(() => new Map());

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

  const loadHeldOrders = useCallback(async () => {
    setListError(null);
    setLoading(true);
    try {
      const localRows = await listLocalHeldOrders();
      let serverRows = [];
      try {
        const res = await apiRequest("/sales", {
          searchParams: {
            per_page: 50,
            with_items: 0,
            "filter[status]": "held",
          },
          loading: false,
          reportIssues: false,
        });
        serverRows = (res.data ?? []).map((row) => ({ ...row, local_held: false }));
      } catch {
        // Offline / API down — local parks still show.
        serverRows = [];
      }
      const list = [...localRows, ...serverRows];
      const count = list.length;
      setRows(list);
      setTotalCount(count);
      setDetailsById({});
      setSelectedOrderId(null);
      setExpandedIds(new Set());
      onCountChange?.(count);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Failed to load held orders");
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  useEffect(() => {
    if (!open) {
      setRows([]);
      setTotalCount(0);
      setDetailsById({});
      setSearch("");
      setListError(null);
      setActionError(null);
      setDetailLoadingId(null);
      setBusyOrderId(null);
      setSelectedOrderId(null);
      setExpandedIds(new Set());
      return;
    }
    loadHeldOrders();
  }, [open, loadHeldOrders]);

  function removeHeldOrderFromMemory(order) {
    const key = orderKey(order);
    if (!key) return;
    setRows((prev) => {
      if (!prev.some((row) => orderKey(row) === key)) return prev;
      const next = prev.filter((row) => orderKey(row) !== key);
      setTotalCount(next.length);
      onCountChange?.(next.length);
      return next;
    });
    setDetailsById((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setExpandedIds((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (String(selectedOrderId) === key) {
      setSelectedOrderId(null);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((s) => {
      const title = heldOrderTitle(s).toLowerCase();
      const receipt = formatReceiptNumber(s).toLowerCase();
      const customer = saleCustomerLabel(s).toLowerCase();
      const orderNum = String(s.order_num ?? s.hold_label ?? "");
      return (
        title.includes(q) ||
        receipt.includes(q) ||
        customer.includes(q) ||
        orderNum.toLowerCase().includes(q)
      );
    });
  }, [rows, search]);

  const selectedOrder = useMemo(
    () => filtered.find((row) => orderKey(row) === String(selectedOrderId ?? "")) ?? null,
    [filtered, selectedOrderId],
  );

  async function loadOrderDetail(order) {
    const key = orderKey(order);
    if (detailsById[key]?.items !== undefined || detailsById[key]?.lines !== undefined) {
      return detailsById[key];
    }
    setDetailLoadingId(key);
    setActionError(null);
    try {
      if (uomById.size === 0) {
        void loadUoms();
      }
      if (order?.local_held || isLocalHeldId(order?.id)) {
        const park = (await getLocalHeldOrder(order.id)) ?? order;
        setDetailsById((prev) => ({ ...prev, [key]: park }));
        return park;
      }
      const sale = await apiRequest(`/sales/${order.id}`);
      setDetailsById((prev) => ({ ...prev, [key]: sale }));
      return sale;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to load order items");
      return null;
    } finally {
      setDetailLoadingId(null);
    }
  }

  function selectOrder(order) {
    setSelectedOrderId(order?.id ?? null);
    setActionError(null);
  }

  function toggleExpand(order, event) {
    event?.stopPropagation?.();
    const key = orderKey(order);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        void loadOrderDetail(order);
      }
      return next;
    });
    // Expanding also selects so Restore/Delete target this row.
    selectOrder(order);
  }

  async function handleRestore(order) {
    if (!order?.id) return;

    if (workspaceHasLines) {
      // Close before confirm so shortcut guards do not stick on stacked dialogs.
      onClose?.();
      const ok = await confirm({
        title: "Restore held order",
        message: "Your workspace has an open order. Replace it with this held order?",
        confirmLabel: "Replace",
        cancelLabel: "Cancel",
        destructive: true,
      });
      if (!ok) return;
    }

    setBusyOrderId(order.id);
    setActionError(null);
    try {
      if (order?.local_held || isLocalHeldId(order.id)) {
        const { cart, park } = await restoreLocalHeldOrder(order.id, cartSeed ?? {});
        // Drop from in-memory held list before closing so the badge count stays accurate.
        removeHeldOrderFromMemory(park ?? order);
        onClose?.();
        onRestored?.(cart, park, { local: true });
        return;
      }

      const cart = await apiRequest(`/sales/orders/${order.id}/restore-to-cart`, {
        method: "POST",
        body: { replace: true },
      });
      removeHeldOrderFromMemory(order);
      onClose?.();
      onRestored?.(cart, order, { local: false });
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to restore order";
      onRestoreFailed?.(message);
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleDelete(order) {
    if (!order?.id) return;
    const label = heldOrderTitle(order);
    const ok = await confirm({
      title: "Delete held order",
      message: `Delete held order ${label}? This cannot be undone.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setBusyOrderId(order.id);
    setActionError(null);
    try {
      if (order?.local_held || isLocalHeldId(order.id)) {
        await deleteLocalHeldOrder(order.id);
      } else {
        await apiRequest(`/sales/orders/${order.id}/cancel-held`, { method: "POST" });
      }
      removeHeldOrderFromMemory(order);
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

  const actionsDisabled = Boolean(busyOrderId) || !selectedOrder;

  return renderPosModalPortal(
    <div className={`${posModalOverlayClass(embedded)}${embedded ? "" : " bg-black/40"}`}>
      {!embedded ? (
        <button
          type="button"
          className="absolute inset-0"
          aria-label="Close"
          onClick={() => {
            if (!busyOrderId) onClose?.();
          }}
        />
      ) : null}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="held-orders-title"
        className={`${posModalPanelClass(embedded, "flex h-[min(88vh,860px)] w-[min(98vw,72rem)] flex-col overflow-hidden theme-panel rounded-xl border shadow-2xl")}`}
      >
        <header className="classic-pos-themed-dialog-header shrink-0 border-b border-[var(--theme-primary-hover)] bg-[var(--theme-primary)] px-4 py-3 text-[var(--theme-primary-fg)]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
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
              <p className="classic-pos-themed-dialog-sub mt-0.5 text-xs text-white/75">
                Select an order, then Restore or Delete. Expand only shows line items.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => void handleRestore(selectedOrder)}
                className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--theme-primary)] hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyOrderId && selectedOrder && busyOrderId === selectedOrder.id
                  ? "…"
                  : "Restore"}
              </button>
              <button
                type="button"
                disabled={actionsDisabled}
                onClick={() => void handleDelete(selectedOrder)}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-700 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete
              </button>
              <button
                type="button"
                disabled={Boolean(busyOrderId)}
                onClick={onClose}
                className="rounded-lg border border-white/30 bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-white/20 disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </header>

        <div className="shrink-0 theme-table-head-row border-b px-4 py-2.5">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search HOLD-#, customer…"
            className={INPUT_CLASS}
          />
          {selectedOrder ? (
            <p className="mt-1.5 truncate text-xs text-slate-600">
              Selected: <span className="font-semibold text-slate-800">{heldOrderTitle(selectedOrder)}</span>
            </p>
          ) : filtered.length > 0 ? (
            <p className="mt-1.5 text-xs text-slate-500">Click a row to select it.</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--theme-surface-subtle)]">
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
              {filtered.map((order) => {
                const key = orderKey(order);
                const detail = detailsById[key] ?? order;
                const items = detail?.items ?? detail?.lines ?? [];
                const isSelected = String(selectedOrderId) === key;
                const isExpanded = expandedIds.has(key);
                const isLoadingItems = detailLoadingId === key;

                return (
                  <li
                    key={key}
                    className={`theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm ${
                      isSelected
                        ? "ring-2 ring-[var(--theme-primary)] ring-offset-1"
                        : ""
                    }`}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onClick={() => selectOrder(order)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectOrder(order);
                        }
                      }}
                      className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left ${
                        isSelected ? "bg-[var(--theme-primary-subtle)]" : "hover:bg-slate-50"
                      }`}
                    >
                      <OrderExpandButton
                        expanded={isExpanded}
                        onClick={(e) => toggleExpand(order, e)}
                        label={isExpanded ? "Hide line items" : "Show line items"}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-slate-900">
                            {heldOrderLabel(order)}
                          </span>
                        </span>
                        <span className="mt-0.5 block text-sm font-medium text-slate-800">
                          {heldCustomerName(order)}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {formatShortDate(order.created_at)}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          Amount
                        </span>
                        <span className="block text-sm font-semibold tabular-nums text-[var(--theme-accent-text)]">
                          {formatSaleKes(order.order_total)}
                        </span>
                      </span>
                    </div>

                    {isExpanded ? (
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
                                  key={line.id ?? line.client_line_id ?? `${line.product_code}-${line.line_no}`}
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
                    ) : null}
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
