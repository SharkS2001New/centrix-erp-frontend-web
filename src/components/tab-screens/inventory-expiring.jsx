"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import {
  Field,
  FilterSelect,
  PaginationBar,
  SearchInput,
  SECONDARY_BTN_CLASS,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { P } from "@/lib/permission-codes";
import {
  formatStockQty,
  InventoryPageShell,
  InventoryTableShell,
  receiptDetailHref,
} from "@/components/inventory/inventory-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";
import { useListRefreshUi } from "@/lib/list-refresh-ui";
import { formatSupplierKes } from "@/components/suppliers/suppliers-shared";

const STATUS_OPTIONS = [
  { value: "open", label: "Open (expired + soon)" },
  { value: "expired", label: "Expired only" },
  { value: "expiring", label: "Expiring soon" },
  { value: "cleared", label: "Cleared" },
  { value: "all", label: "All with expiry" },
];

function statusBadge(status) {
  if (status === "expired") {
    return (
      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-800">
        Expired
      </span>
    );
  }
  if (status === "expiring") {
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
        Expiring
      </span>
    );
  }
  if (status === "cleared") {
    return (
      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
        Cleared
      </span>
    );
  }
  return status ?? "—";
}

function daysLabel(days) {
  if (days == null) return "—";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Today";
  return `${days}d left`;
}

export function InventoryExpiringScreen() {
  const confirm = useConfirm();
  const { user, hasPermission, capabilities } = useAuth();
  const batchTrackingOn = Boolean(
    capabilities?.module_settings?.inventory?.enable_receive_batch_tracking,
  );
  const canClear =
    hasPermission("inventory.manage") || hasPermission("inventory.damages.create");
  const canReturn = hasPermission(P.purchasing.supplier_returns.create)
    || hasPermission("purchasing.manage");

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [status, setStatus] = useState("open");
  const [withinDays, setWithinDays] = useState("30");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(15);
  const [clearingId, setClearingId] = useState(null);

  const loadRows = useCallback(async () => {
    if (!batchTrackingOn) {
      setRows([]);
      setTotal(0);
      setTotalPages(1);
      setLoading(false);
      setListLoading(false);
      return;
    }
    setListLoading(true);
    try {
      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        extra: {
          status,
          within_days: withinDays || 30,
          branch_id: user?.branch_id || undefined,
        },
      });
      const res = await apiRequest("/inventory/expiring-batches", { searchParams });
      const parsed = parsePaginator(res);
      setRows(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load expiring batches");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [batchTrackingOn, page, pageSize, debouncedSearch, status, withinDays, user?.branch_id]);

  useTabAwareDataLoad(loadRows);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, status, withinDays]);

  const safePage = Math.min(page, totalPages);
  const listRefresh = useListRefreshUi({
    loading,
    listLoading,
    hasRows: rows.length > 0,
  });

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  async function clearBatch(row) {
    const qty = Number(row.suggested_clear_qty ?? 0);
    const product = row.product_name || row.product_code;
    const batch = row.batch_no ? ` batch ${row.batch_no}` : "";
    const stockNote =
      qty > 0
        ? ` This will write off ${formatStockQty(qty)} from ${row.stock_location} stock.`
        : " No stock remains on hand — the lot will only be removed from this list.";

    const ok = await confirm({
      title: "Clear expired / expiring batch",
      message: `Clear ${product}${batch} (expiry ${formatShortDate(row.expiry_date)})?${stockNote} Use this when the physical stock is finished or returned to the supplier.`,
      confirmLabel: qty > 0 ? "Clear & write off" : "Clear from list",
      destructive: qty > 0,
    });
    if (!ok) return;

    setClearingId(row.id);
    try {
      const res = await apiRequest(`/inventory/expiring-batches/${row.id}/clear`, {
        method: "POST",
        body: {
          quantity: qty,
          reason: undefined,
        },
      });
      notifySuccess(res?.message || "Batch cleared.");
      await loadRows();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to clear batch");
    } finally {
      setClearingId(null);
    }
  }

  if (!batchTrackingOn) {
    return (
      <InventoryPageShell
        title="Expiring products"
        subtitle="Expired and soon-to-expire batches from goods received"
      >
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Batch / expiry tracking is off for this organization. Enable{" "}
          <strong>Receive batch &amp; expiry tracking</strong> in platform Applications (Inventory)
          so GRN lots appear here.
        </p>
      </InventoryPageShell>
    );
  }

  return (
    <InventoryPageShell
      title="Expiring products"
      subtitle="Batches past or nearing expiry — clear when stock is finished or returned to supplier"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadRows()}
            disabled={listLoading}
            className={SECONDARY_BTN_CLASS}
          >
            {listLoading ? "Refreshing…" : "Refresh"}
          </button>
          <Link
            href="/inventory/receipts"
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Goods received
          </Link>
          {canReturn ? (
            <Link
              href="/suppliers/returns"
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Supplier returns
            </Link>
          ) : null}
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <FilterSelect
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={STATUS_OPTIONS}
        />
        <Field label="Within days">
          <input
            type="number"
            min={1}
            max={365}
            className={inputClassName()}
            value={withinDays}
            onChange={(e) => setWithinDays(e.target.value)}
          />
        </Field>
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search batch, invoice, product…"
        />
      </div>

      {!listRefresh.showInitialLoading ? (
        <p className="mb-3 text-sm text-slate-600">
          Showing {total} batch{total === 1 ? "" : "es"}
        </p>
      ) : null}

      <InventoryTableShell>
        {listRefresh.showInitialLoading ? (
          <p className="p-8 text-sm text-slate-500">Loading expiring batches…</p>
        ) : (
          <div className={listRefresh.contentClassName}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5">Product</th>
                    <th className="px-4 py-2.5">Batch</th>
                    <th className="px-4 py-2.5">Expiry</th>
                    <th className="px-4 py-2.5 text-right">Received</th>
                    <th className="px-4 py-2.5 text-right">On hand</th>
                    <th className="px-4 py-2.5">Supplier / invoice</th>
                    <th className="px-4 py-2.5 text-right">Cost</th>
                    <th className="px-4 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                        No expiring batches found.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1">
                            {statusBadge(row.status)}
                            <span className="text-[11px] text-slate-500">
                              {daysLabel(row.days_to_expiry)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/products/${encodeURIComponent(row.product_code)}`}
                            className="font-medium text-[#185FA5] hover:underline"
                          >
                            {row.product_name || row.product_code}
                          </Link>
                          <div className="text-xs text-slate-500">{row.product_code}</div>
                          <div className="text-[11px] uppercase text-slate-400">
                            {row.stock_location}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {row.batch_no || "—"}
                        </td>
                        <td className="px-4 py-3">{formatShortDate(row.expiry_date)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatStockQty(row.units_received)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatStockQty(row.on_hand)}
                        </td>
                        <td className="px-4 py-3">
                          {row.supplier_id ? (
                            <Link
                              href={`/suppliers/${row.supplier_id}`}
                              className="text-[#185FA5] hover:underline"
                            >
                              {row.supplier_name || "Supplier"}
                            </Link>
                          ) : (
                            <span className="text-slate-500">{row.supplier_name || "—"}</span>
                          )}
                          <div className="text-xs text-slate-500">
                            {row.invoice_number || "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                          {row.cost_price != null ? formatSupplierKes(row.cost_price) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex flex-wrap items-center justify-end gap-2">
                            {row.invoice_number ? (
                              <Link
                                href={receiptDetailHref(row.invoice_number)}
                                className="text-xs font-medium text-slate-600 hover:underline"
                              >
                                GRN
                              </Link>
                            ) : null}
                            {canReturn && row.supplier_id ? (
                              <Link
                                href={`/suppliers/returns?supplier_id=${row.supplier_id}`}
                                className="text-xs font-medium text-slate-600 hover:underline"
                              >
                                Return
                              </Link>
                            ) : null}
                            {canClear && row.status !== "cleared" ? (
                              <button
                                type="button"
                                disabled={clearingId === row.id}
                                onClick={() => void clearBatch(row)}
                                className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-800 hover:bg-red-100 disabled:opacity-50"
                              >
                                {clearingId === row.id ? "Clearing…" : "Clear"}
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        )}
      </InventoryTableShell>
    </InventoryPageShell>
  );
}
