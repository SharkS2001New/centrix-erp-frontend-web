"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useAuth } from "@/contexts/auth-context";
import {
  FilterSelect,
  PaginationBar,
  PrimaryLink,
  SearchInput,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { printSaleOrder } from "@/components/sales/sale-order-print";
import { formatReceiptNumber, formatSaleKes, legacyOrderDisplayTotal } from "@/lib/sales";
import { currentMonthDateRange } from "@/lib/dashboard-dates";
import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { getOrderDocumentType } from "@/lib/sales-settings";
import {
  disposePrintWindow,
  openBlankPrintWindow,
  printWindowFeatures,
  PRINT_BLOCKED_MESSAGE,
} from "@/lib/open-print-window";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useConfirm } from "@/lib/use-confirm";

const PAGE_SIZE = 25;
const defaultMonthRange = currentMonthDateRange();

function ThermalPrintIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  );
}

function A4PrintIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function LegacyPrintButton({ icon, label, disabled, onClick }) {
  return (
    <button
      type="button"
      className="inline-flex cursor-pointer items-center gap-1 rounded-md px-1 py-0.5 text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function legacyReturnStatusLabel(summary) {
  if (!summary?.has_returns) return "No returns";
  if (summary?.fully_returned) return "Fully returned";
  return "Partially returned";
}

function LegacyOrdersContent() {
  const confirm = useConfirm();
  const { user, hasPermission, organization, capabilities } = useAuth();
  const isAdmin = Boolean(user?.is_admin);
  const canManageSales = Boolean(hasPermission?.("sales.manage"));
  const canDeleteLegacyOrder = useCallback(
    (row) => {
      const summary = row?.legacy_return_summary ?? {};
      if (isAdmin && summary.can_admin_delete !== false) {
        return true;
      }
      return canManageSales && summary.can_delete !== false;
    },
    [isAdmin, canManageSales],
  );
  const searchParams = useSearchParams();
  const [rows, setRows] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [fromDate, setFromDate] = useState(defaultMonthRange.from);
  const [toDate, setToDate] = useState(defaultMonthRange.to);
  const [returnsFilter, setReturnsFilter] = useState("all");
  const [minTotalFilter, setMinTotalFilter] = useState("");
  const [maxTotalFilter, setMaxTotalFilter] = useState("");
  const debouncedMinTotal = useDebouncedValue(minTotalFilter);
  const debouncedMaxTotal = useDebouncedValue(maxTotalFilter);
  const [page, setPage] = useState(1);
  const [deletingId, setDeletingId] = useState(null);
  const [printingId, setPrintingId] = useState(null);

  const loadData = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const extra = {};
      if (fromDate) extra.from_date = fromDate;
      if (toDate) extra.to_date = toDate;
      if (returnsFilter === "with_returns") extra.has_returns = true;
      if (returnsFilter === "no_returns") extra.has_returns = false;
      if (debouncedMinTotal !== "") extra.min_order_total = debouncedMinTotal;
      if (debouncedMaxTotal !== "") extra.max_order_total = debouncedMaxTotal;

      const params = buildPageParams({
        page,
        perPage: PAGE_SIZE,
        q: debouncedSearch,
        extra,
      });

      const res = await apiRequest("/legacy-orders", { searchParams: params });
      const parsed = parsePaginator(res);
      setRows(parsed.items);
      setTotalOrders(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load legacy orders");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [page, debouncedSearch, fromDate, toDate, returnsFilter, debouncedMinTotal, debouncedMaxTotal]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, fromDate, toDate, returnsFilter, debouncedMinTotal, debouncedMaxTotal]);

  async function printLegacyOrder(row, documentType) {
    if (!row?.id || printingId) return;

    const cachedType = documentType ?? getOrderDocumentType(capabilities?.module_settings);
    const printWindow =
      cachedType !== "both"
        ? openBlankPrintWindow(printWindowFeatures(cachedType))
        : null;
    if (cachedType !== "both" && !printWindow) {
      notifyError(PRINT_BLOCKED_MESSAGE);
      return;
    }

    setPrintingId(row.id);
    try {
      const detail = await apiRequest(`/legacy-orders/${row.id}`, {
        loading: false,
        searchParams: { for_print: "1" },
      });
      const printed = await printSaleOrder(detail, {
        organization,
        organizationName: capabilities?.profile_label ?? DEFAULT_PRINT_ORG_NAME,
        moduleSettings: capabilities?.module_settings,
        capabilities,
        user,
        printWindow,
        ...(documentType ? { documentType } : {}),
      });
      if (!printed) {
        disposePrintWindow(printWindow);
      }
    } catch (e) {
      disposePrintWindow(printWindow);
      notifyError(e instanceof Error ? e.message : "Print failed");
    } finally {
      setPrintingId(null);
    }
  }

  async function deleteLegacyOrder(row) {
    if (!canDeleteLegacyOrder(row) || !row?.id) return;
    const summary = row.legacy_return_summary ?? {};
    const hasReturns = (summary.return_count_all ?? summary.return_count ?? 0) > 0
      || summary.has_returns
      || summary.can_delete === false;

    const ok = await confirm({
      title: "Delete legacy order",
      message: hasReturns && isAdmin
        ? `Remove ${formatReceiptNumber(row)} (${row.fulfillment_meta?.legacy_order_label ?? "legacy"}) and its linked legacy returns from Centrix? The original sale stays in the legacy archive and can be materialized again.`
        : `Remove ${formatReceiptNumber(row)} (${row.fulfillment_meta?.legacy_order_label ?? "legacy"}) from Centrix? The original sale stays in the legacy archive and can be materialized again.`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;

    setDeletingId(row.id);
    try {
      await apiRequest(`/legacy-orders/${row.id}`, { method: "DELETE" });
      notifySuccess("Legacy order deleted.");
      await loadData();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not delete legacy order");
    } finally {
      setDeletingId(null);
    }
  }

  const highlightSaleId = searchParams.get("sale_id");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Legacy orders</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Materialized LightStores sales for KRA returns. Centrix stock is not affected by legacy
            returns.
          </p>
        </div>
        <PrimaryLink href="/sales/legacy-returns/new">New legacy return</PrimaryLink>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Order, customer, legacy ref, total…"
        />
        <input
          type="date"
          className="rounded-md border px-3 py-2 text-sm"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          title="From date"
        />
        <input
          type="date"
          className="rounded-md border px-3 py-2 text-sm"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          title="To date"
        />
        <FilterSelect
          value={returnsFilter}
          onChange={(e) => setReturnsFilter(e.target.value)}
          options={[
            { value: "all", label: "All orders" },
            { value: "with_returns", label: "With returns" },
            { value: "no_returns", label: "No returns yet" },
          ]}
        />
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Min total (KES)
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className="w-36 rounded-md border px-3 py-2 text-sm"
            value={minTotalFilter}
            onChange={(e) => setMinTotalFilter(e.target.value)}
            placeholder="e.g. 10000"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-600">
          Max total (KES)
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            className="w-36 rounded-md border px-3 py-2 text-sm"
            value={maxTotalFilter}
            onChange={(e) => setMaxTotalFilter(e.target.value)}
            placeholder="e.g. 50000"
          />
        </label>
      </div>

      <div className="theme-panel overflow-x-auto rounded-lg border">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Order</th>
              <th className="px-3 py-2">Legacy ref</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Legacy total</th>
              <th className="px-3 py-2">Returns</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  {listLoading ? "Loading…" : "No materialized legacy orders found."}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const summary = row.legacy_return_summary ?? {};
                const highlighted = highlightSaleId && String(row.id) === highlightSaleId;
                return (
                  <tr
                    key={row.id}
                    className={`border-t ${highlighted ? "bg-amber-50" : ""}`}
                  >
                    <td className="px-3 py-2 font-medium">{formatReceiptNumber(row)}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {row.fulfillment_meta?.legacy_order_label ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      {row.customer?.customer_name ?? row.customer_name_override ?? "Walk-in"}
                    </td>
                    <td className="px-3 py-2">
                      {formatShortDate(row.completed_at ?? row.fulfillment_meta?.legacy_sale_date)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatSaleKes(legacyOrderDisplayTotal(row))}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          summary.fully_returned
                            ? "text-emerald-700"
                            : summary.has_returns
                              ? "text-amber-800"
                              : "text-slate-500"
                        }
                      >
                        {legacyReturnStatusLabel(summary)}
                      </span>
                      {summary.return_count > 0 ? (
                        <div className="text-xs text-slate-500">
                          {summary.return_count} return(s) · {formatSaleKes(summary.returned_total)}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <LegacyPrintButton
                          icon={<ThermalPrintIcon />}
                          label={printingId === row.id ? "Printing…" : "Print thermal"}
                          disabled={printingId === row.id || listLoading}
                          onClick={() => printLegacyOrder(row, "receipt")}
                        />
                        <LegacyPrintButton
                          icon={<A4PrintIcon />}
                          label="Print A4"
                          disabled={printingId === row.id || listLoading}
                          onClick={() => printLegacyOrder(row, "invoice")}
                        />
                        <Link
                          href={`/sales/legacy-returns/new?sale_id=${row.id}`}
                          className="text-indigo-600 hover:text-indigo-800"
                        >
                          Return
                        </Link>
                        {canDeleteLegacyOrder(row) ? (
                          <button
                            type="button"
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                            disabled={deletingId === row.id || listLoading}
                            onClick={() => deleteLegacyOrder(row)}
                          >
                            {deletingId === row.id ? "Deleting…" : "Delete"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={totalOrders}
        pageSize={PAGE_SIZE}
        onChange={setPage}
      />
    </div>
  );
}

export default function LegacyOrdersPage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-500">Loading legacy orders…</p>}>
      <LegacyOrdersContent />
    </Suspense>
  );
}
