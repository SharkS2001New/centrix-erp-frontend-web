"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { posModalOverlayClass, posModalPanelClass, renderPosModalPortal } from "@/lib/pos-modal-shell";
import { apiRequest } from "@/lib/api";
import { formatShortDate, INPUT_CLASS, TABLE_HEAD_ROW_CLASS } from "@/components/catalog/catalog-shared";
import {
  saleLineSoldUnitPrice,
  saleLineListRowAmount,
  saleLineProductLabel,
  saleLineQtyLabel,
} from "@/lib/sale-line-items";
import { formatSaleKes } from "@/components/sales/sales-shared";
import { OrderExpandButton } from "@/components/sales/sales-orders-shared";
import { formatPosBrowseLabel, saleCustomerLabel } from "@/lib/sales";
import { useConfirm } from "@/lib/use-confirm";
import { fetchUomsCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import {
  deleteLocalHeldOrder,
  getLocalHeldOrder,
  heldAmountPaid,
  heldBalanceDue,
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
  // External POS: Cash Sales # only — never org S# / order_num.
  return formatPosBrowseLabel(order);
}

function heldCustomerName(order) {
  return (
    saleCustomerLabel(order) ||
    order?.customer_name ||
    order?.customer_name_override ||
    order?.customer?.customer_name ||
    order?.customer_display_name ||
    "Walk-in"
  );
}

function heldOrderPaidAmount(order) {
  return heldAmountPaid(order);
}

function heldOrderBalanceRemaining(order) {
  const total = Math.max(0, Number(order?.order_total ?? 0));
  return heldBalanceDue(order, total);
}

function heldOrderSearchHaystack(order) {
  const parts = [
    heldCustomerName(order),
    heldOrderLabel(order),
    order?.pos_order_num,
    order?.hold_label,
    order?.customer_name_override,
    order?.customer_name,
    order?.customer?.customer_name,
    order?.customer_display_name,
    order?.customer?.phone,
    order?.customer_phone,
  ];
  return parts
    .filter((v) => v != null && String(v).trim() !== "")
    .map((v) => String(v).toLowerCase())
    .join(" ");
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
  classicTheme = false,
  themeStyle = null,
  /** When false, hide Paid / Balance (hold amount-paid capture is off). */
  showHeldAmountPaid = false,
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
  const [restoreStatus, setRestoreStatus] = useState(null);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [checkedIds, setCheckedIds] = useState(() => new Set());
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [uomById, setUomById] = useState(() => new Map());
  const searchInputRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const focusSearch = () => {
      searchInputRef.current?.focus({ preventScroll: true });
      searchInputRef.current?.select?.();
    };
    focusSearch();
    const t0 = window.setTimeout(focusSearch, 0);
    const t1 = window.setTimeout(focusSearch, 50);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [open]);

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
      // Local parks are on-device — show them immediately.
      setRows(localRows);
      setTotalCount(localRows.length);
      onCountChange?.(localRows.length);

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
        serverRows = [];
      }

      const list = [...localRows, ...serverRows];
      setRows(list);
      setTotalCount(list.length);
      onCountChange?.(list.length);
      setDetailsById((prev) => {
        const next = { ...prev };
        for (const row of localRows) {
          const key = orderKey(row);
          if (key && (row.items?.length || row.lines?.length)) {
            next[key] = row;
          }
        }
        return next;
      });
      setSelectedOrderId(null);
      setCheckedIds(new Set());
      setExpandedIds(new Set());
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
      setRestoreStatus(null);
      setSelectedOrderId(null);
      setCheckedIds(new Set());
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
    setCheckedIds((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    if (String(selectedOrderId) === key) {
      setSelectedOrderId(null);
    }
  }

  function toggleChecked(order, event) {
    event?.stopPropagation?.();
    const key = orderKey(order);
    if (!key) return;
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase().replace(/\s+/g, " ");
    if (!q) return rows;
    const tokens = q.split(" ").filter(Boolean);
    return rows.filter((s) => {
      const haystack = heldOrderSearchHaystack(s);
      // Every token must match (supports "john kai" style customer searches).
      return tokens.every((token) => haystack.includes(token));
    });
  }, [rows, search]);

  function toggleCheckAllVisible() {
    const visibleKeys = filtered.map((order) => orderKey(order)).filter(Boolean);
    if (visibleKeys.length === 0) return;
    setCheckedIds((prev) => {
      const allChecked = visibleKeys.every((key) => prev.has(key));
      const next = new Set(prev);
      if (allChecked) {
        for (const key of visibleKeys) next.delete(key);
      } else {
        for (const key of visibleKeys) next.add(key);
      }
      return next;
    });
  }

  const selectedOrder = useMemo(
    () => filtered.find((row) => orderKey(row) === String(selectedOrderId ?? "")) ?? null,
    [filtered, selectedOrderId],
  );

  const checkedOrders = useMemo(
    () => rows.filter((row) => checkedIds.has(orderKey(row))),
    [rows, checkedIds],
  );

  const visibleCheckedCount = useMemo(
    () => filtered.filter((row) => checkedIds.has(orderKey(row))).length,
    [filtered, checkedIds],
  );

  const allVisibleChecked =
    filtered.length > 0 && visibleCheckedCount === filtered.length;
  const someVisibleChecked = visibleCheckedCount > 0 && !allVisibleChecked;

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
    if (!order) return;
    const key = orderKey(order);
    setSelectedOrderId(order.id ?? null);
    setActionError(null);
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    const hasItems = (order.items?.length ?? order.lines?.length ?? 0) > 0;
    if (hasItems) {
      setDetailsById((prev) => ({ ...prev, [key]: order }));
    } else {
      void loadOrderDetail(order);
    }
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
    if (!order?.id || busyOrderId) return;

    if (workspaceHasLines) {
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
    setRestoreStatus(
      order?.local_held || isLocalHeldId(order.id)
        ? "Restoring held order…"
        : "Restoring held order from server…",
    );
    setActionError(null);
    try {
      if (order?.local_held || isLocalHeldId(order.id)) {
        const { cart, park } = await restoreLocalHeldOrder(order.id, cartSeed ?? {});
        removeHeldOrderFromMemory(park ?? order);
        await onRestored?.(cart, park, { local: true });
        onClose?.();
        return;
      }

      const cart = await apiRequest(`/sales/orders/${order.id}/restore-to-cart`, {
        method: "POST",
        body: { replace: true },
        loading: false,
        reportIssues: false,
      });
      removeHeldOrderFromMemory(order);
      await onRestored?.(cart, order, { local: false });
      onClose?.();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to restore order";
      setRestoreStatus(null);
      onRestoreFailed?.(message);
    } finally {
      setBusyOrderId(null);
      setRestoreStatus(null);
    }
  }

  async function deleteHeldOrder(order) {
    if (order?.local_held || isLocalHeldId(order.id)) {
      await deleteLocalHeldOrder(order.id);
    } else {
      await apiRequest(`/sales/orders/${order.id}/cancel-held`, { method: "POST" });
    }
    removeHeldOrderFromMemory(order);
  }

  async function handleDelete(order) {
    if (!order?.id) return;
    const label = `${heldOrderLabel(order)} - ${heldCustomerName(order)}`;
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
      await deleteHeldOrder(order);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to delete held order");
    } finally {
      setBusyOrderId(null);
    }
  }

  async function handleDeleteChecked() {
    const targets =
      checkedOrders.length > 0
        ? checkedOrders
        : selectedOrder
          ? [selectedOrder]
          : [];
    if (targets.length === 0 || busyOrderId) return;

    if (targets.length === 1) {
      await handleDelete(targets[0]);
      return;
    }

    const ok = await confirm({
      title: "Delete held orders",
      message: `Delete ${targets.length} selected held orders? This cannot be undone.`,
      confirmLabel: `Delete ${targets.length}`,
      destructive: true,
    });
    if (!ok) return;

    setBusyOrderId("__bulk__");
    setActionError(null);
    let failed = 0;
    try {
      for (const order of targets) {
        try {
          await deleteHeldOrder(order);
        } catch (e) {
          console.error("Failed to delete held order", e);
          failed += 1;
        }
      }
      if (failed > 0) {
        setActionError(
          failed === targets.length
            ? "Failed to delete the selected held orders."
            : `Deleted some held orders; ${failed} could not be removed.`,
        );
      }
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

  const deleteCount = checkedOrders.length > 0 ? checkedOrders.length : selectedOrder ? 1 : 0;
  const restoreDisabled = Boolean(busyOrderId) || !selectedOrder;
  const deleteDisabled = Boolean(busyOrderId) || deleteCount === 0;

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
        data-pos-layout={classicTheme ? "classic" : undefined}
        className={`${posModalPanelClass(
          embedded,
          [
            "flex h-[min(88vh,860px)] w-[min(98vw,72rem)] flex-col overflow-hidden theme-panel rounded-xl border shadow-2xl",
            classicTheme ? "pos-workspace-classic" : "",
          ]
            .filter(Boolean)
            .join(" "),
        )}`}
        style={themeStyle ?? undefined}
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
              <p className="classic-pos-themed-dialog-sub mt-0.5 text-xs opacity-80">
                Check orders to delete several at once. Click a row to restore one.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={restoreDisabled}
                onClick={() => void handleRestore(selectedOrder)}
                className="theme-primary-btn rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyOrderId && selectedOrder && busyOrderId === selectedOrder.id
                  ? "Restoring…"
                  : "Restore"}
              </button>
              <button
                type="button"
                disabled={deleteDisabled}
                onClick={() => void handleDeleteChecked()}
                className="rounded-lg border border-red-300/80 bg-red-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busyOrderId === "__bulk__"
                  ? "Deleting…"
                  : deleteCount > 1
                    ? `Delete (${deleteCount})`
                    : "Delete"}
              </button>
              <button
                type="button"
                disabled={Boolean(busyOrderId)}
                onClick={onClose}
                className="theme-secondary-btn rounded-lg border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide disabled:opacity-50"
              >
                Close
              </button>
            </div>
          </div>
        </header>

        <div className="shrink-0 theme-table-head-row border-b border-[var(--theme-border)] px-4 py-2.5">
          <div className="flex items-center gap-3">
            {filtered.length > 0 ? (
              <label
                className="inline-flex shrink-0 items-center gap-2 text-xs font-medium text-[var(--theme-text)]"
                title="Select all visible held orders"
              >
                <input
                  type="checkbox"
                  checked={allVisibleChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someVisibleChecked;
                  }}
                  onChange={() => toggleCheckAllVisible()}
                  disabled={Boolean(busyOrderId)}
                  className="h-4 w-4 rounded border-[var(--theme-border)] accent-[var(--theme-primary)]"
                  aria-label="Select all visible held orders"
                />
                <span className="theme-text-muted whitespace-nowrap">
                  {visibleCheckedCount > 0
                    ? `${visibleCheckedCount} selected`
                    : "Select all"}
                </span>
              </label>
            ) : null}
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by customer name or HOLD #…"
              autoFocus
              aria-label="Search held orders by customer name"
              className={INPUT_CLASS}
            />
          </div>
          {checkedOrders.length > 0 ? (
            <p className="theme-text-muted mt-1.5 text-xs">
              {checkedOrders.length} held order{checkedOrders.length === 1 ? "" : "s"} checked
              for delete.
              {selectedOrder ? (
                <>
                  {" "}
                  Restore target:{" "}
                  <span className="theme-heading font-semibold">
                    {heldCustomerName(selectedOrder)}
                  </span>
                  <span className="theme-text-subtle"> · {heldOrderLabel(selectedOrder)}</span>
                </>
              ) : null}
            </p>
          ) : selectedOrder ? (
            <p className="theme-text-muted mt-1.5 truncate text-xs">
              Selected:{" "}
              <span className="theme-heading font-semibold">{heldCustomerName(selectedOrder)}</span>
              <span className="theme-text-subtle"> · {heldOrderLabel(selectedOrder)}</span>
            </p>
          ) : filtered.length > 0 ? (
            <p className="theme-text-muted mt-1.5 text-xs">
              Check rows to delete, or click a row to restore.
            </p>
          ) : null}
        </div>

        {restoreStatus ? (
          <div
            className="shrink-0 flex items-center gap-3 border-b border-[var(--theme-border)] bg-[var(--theme-primary-subtle)] px-4 py-2.5 text-sm text-[var(--theme-primary)]"
            role="status"
            aria-live="polite"
          >
            <span
              className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[var(--theme-primary)] border-t-transparent"
              aria-hidden
            />
            <span>{restoreStatus}</span>
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--theme-surface-subtle)]">
          {loading ? (
            <p className="theme-text-muted px-4 py-10 text-center text-sm">Loading held orders…</p>
          ) : listError ? (
            <p className="m-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {listError}
            </p>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
              <p className="theme-heading text-sm font-medium">
                {search.trim() ? "No matching held orders" : "No held orders"}
              </p>
              <p className="theme-text-muted mt-1 text-sm">
                {search.trim()
                  ? `Nothing matches “${search.trim()}”. Try another customer name or HOLD #.`
                  : "Use Hold on the cart to park a sale for later."}
              </p>
            </div>
          ) : (
            <ul className="space-y-2 p-3">
              {filtered.map((order) => {
                const key = orderKey(order);
                const detail = detailsById[key] ?? order;
                const items = detail?.items ?? detail?.lines ?? [];
                const isSelected = String(selectedOrderId) === key;
                const isChecked = checkedIds.has(key);
                const isExpanded = expandedIds.has(key);
                const isLoadingItems = detailLoadingId === key;

                return (
                  <li
                    key={key}
                    className={`theme-panel theme-table-shell overflow-hidden rounded-xl border border-[var(--theme-border)] shadow-sm ${
                      isSelected
                        ? "ring-2 ring-[var(--theme-primary)] ring-offset-1 ring-offset-[var(--theme-surface-subtle)]"
                        : ""
                    }`}
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onClick={() => selectOrder(order)}
                      onDoubleClick={(e) => {
                        e.preventDefault();
                        selectOrder(order);
                        void handleRestore(order);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectOrder(order);
                        }
                      }}
                      className={`flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left ${
                        isSelected
                          ? "bg-[var(--theme-primary-subtle)]"
                          : "hover:bg-[var(--theme-hover)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={(e) => toggleChecked(order, e)}
                        onClick={(e) => e.stopPropagation()}
                        disabled={Boolean(busyOrderId)}
                        className="h-4 w-4 shrink-0 rounded border-[var(--theme-border)] accent-[var(--theme-primary)]"
                        aria-label={`Select held order ${heldOrderLabel(order)} for ${heldCustomerName(order)}`}
                      />
                      <OrderExpandButton
                        expanded={isExpanded}
                        onClick={(e) => toggleExpand(order, e)}
                        label={isExpanded ? "Hide line items" : "Show line items"}
                      />
                      {/* Customer · optional Paid/Balance · total */}
                      <div
                        className={`grid min-w-0 flex-1 items-start gap-3 ${
                          showHeldAmountPaid ? "grid-cols-3" : "grid-cols-2"
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="theme-heading truncate text-base font-bold leading-tight">
                            {heldCustomerName(order)}
                          </div>
                          <div className="theme-text-muted mt-0.5 truncate text-xs font-medium leading-tight">
                            {heldOrderLabel(order)}
                          </div>
                        </div>
                        {showHeldAmountPaid ? (
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold leading-tight tabular-nums text-[var(--theme-text)]">
                              Paid {formatSaleKes(heldOrderPaidAmount(order))}
                            </div>
                            <div className="theme-text-muted mt-0.5 truncate text-xs leading-tight tabular-nums">
                              Balance {formatSaleKes(heldOrderBalanceRemaining(order))}
                            </div>
                          </div>
                        ) : null}
                        <div className="min-w-0 text-right">
                          <div className="truncate text-sm font-bold leading-tight tabular-nums text-[var(--theme-accent-text)]">
                            {formatSaleKes(order.order_total)}
                          </div>
                          <div className="theme-text-muted mt-0.5 truncate text-xs leading-tight">
                            Held order total
                          </div>
                        </div>
                      </div>
                    </div>

                    {isExpanded ? (
                      <div className="w-full border-t border-[var(--theme-border)] bg-[var(--theme-surface-muted)]">
                        {isLoadingItems ? (
                          <p className="theme-text-muted px-4 py-3 text-xs">Loading items…</p>
                        ) : items.length === 0 ? (
                          <p className="theme-text-muted px-4 py-3 text-xs">No line items on this order.</p>
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
                                  className="border-b border-[var(--theme-border)] last:border-b-0"
                                >
                                  <td className="theme-heading px-4 py-2.5">
                                    {saleLineProductLabel(line)}
                                    {line.on_wholesale_retail ? (
                                      <span className="ml-1.5 rounded bg-[var(--theme-primary-subtle)] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[var(--theme-primary)]">
                                        Retail
                                      </span>
                                    ) : null}
                                  </td>
                                  <td className="theme-text-muted px-4 py-2.5 text-center">
                                    {saleLineQtyLabel(line, uomById)}
                                  </td>
                                  <td className="theme-text-muted px-4 py-2.5 text-right">
                                    {formatSaleKes(saleLineSoldUnitPrice(line, uomById))}
                                  </td>
                                  <td className="theme-heading px-4 py-2.5 text-right font-medium">
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
