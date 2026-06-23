"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { PaginationBar } from "@/components/catalog/catalog-shared";
import { ReportBadge } from "@/components/reports/report-screen-shared";
import { defaultDashboardDateRange } from "@/lib/dashboard-dates";
import {
  fetchLegacyArchiveSale,
  fetchLegacyArchiveSales,
  fetchLegacyArchiveStatus,
  fetchLegacyArchiveSummary,
  materializeLegacySale,
} from "@/lib/legacy-archive-api";

const PAGE_SIZE = 20;

const CHANNELS = [
  { key: "all", label: "All channels" },
  { key: "pos", label: "POS" },
  { key: "mobile", label: "Mobile" },
  { key: "debtor", label: "Debtor / credit" },
];

const defaultRange = defaultDashboardDateRange(29);

const CHANNEL_LABELS = {
  pos: "POS",
  mobile: "MOBILE",
  debtor: "DEBTOR",
};

function legacySaleDate(row) {
  const value = row?.legacy_sale_date ?? row?.sale_date;
  if (!value) return null;
  return String(value).slice(0, 10);
}

function money(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—";
}

function channelSummaryCards(summary) {
  if (!summary?.by_channel) return [];
  return Object.entries(summary.by_channel).map(([channel, row]) => ({
    channel,
    total_amount: row.order_total,
    sale_count: row.transactions,
  }));
}

function SaleDetailDrawer({ sale, onClose, onMaterialized }) {
  const [materializing, setMaterializing] = useState(false);
  const [notice, setNotice] = useState(null);

  if (!sale) return null;

  const orderLabel = sale.legacy_order_label ?? sale.legacy_order_num;
  const orderNum = sale.legacy_order_num;
  const centrixSaleId = sale.materialized_sale_id ?? sale.centrix_sale_id;

  const handleMaterialize = async () => {
    setMaterializing(true);
    setNotice(null);
    try {
      const result = await materializeLegacySale(
        sale.archive_channel ?? sale.channel,
        orderNum,
        legacySaleDate(sale),
      );
      const saleId = result?.sale?.id;
      setNotice({
        type: "success",
        text: "Sale copied into Centrix for returns and credit notes.",
      });
      onMaterialized?.(saleId);
    } catch (err) {
      setNotice({
        type: "error",
        text: err?.message ?? "Could not materialize sale.",
      });
    } finally {
      setMaterializing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Legacy sale</p>
            <h2 className="text-lg font-semibold text-slate-900">
              {orderLabel}
              <span className="sr-only">#{orderNum}</span>
              <span className="ml-2">
                <ReportBadge label={CHANNEL_LABELS[sale.archive_channel ?? sale.channel] ?? sale.channel} tone="neutral" />
              </span>
            </h2>
            <p className="mt-1 text-sm text-slate-500">{legacySaleDate(sale)}</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-slate-500">Customer</dt>
              <dd className="font-medium text-slate-900">{sale.customer_name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Total</dt>
              <dd className="font-medium text-slate-900">{money(sale.order_total)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">VAT</dt>
              <dd className="font-medium text-slate-900">{money(sale.total_vat)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Created by</dt>
              <dd className="font-medium text-slate-900">{sale.created_by ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Payment</dt>
              <dd className="font-medium text-slate-900">{sale.payment_method ?? sale.payment_status ?? "—"}</dd>
            </div>
          </dl>

          <h3 className="mb-2 mt-6 text-sm font-semibold text-slate-900">Line items</h3>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Product</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Unit price</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {(sale.lines ?? []).map((line, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2">{line.product_name ?? line.product_code}</td>
                    <td className="px-3 py-2 text-right">{line.quantity}</td>
                    <td className="px-3 py-2 text-right">{money(line.unit_price)}</td>
                    <td className="px-3 py-2 text-right">{money(line.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {notice ? (
            <p
              className={`mt-4 rounded-lg px-3 py-2 text-sm ${
                notice.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
              }`}
            >
              {notice.text}
            </p>
          ) : null}

          <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-medium">Returns &amp; credit notes</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-amber-900/90">
              <li>Click <strong>Materialize into Centrix</strong> to copy this sale into the live database.</li>
              <li>
                Then open <strong>Create return / credit note</strong> — same flow as any Centrix sale at{" "}
                <code className="rounded bg-amber-100 px-1">Sales → Customer returns</code>.
              </li>
            </ol>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-200 px-5 py-4">
          {centrixSaleId ? (
            <Link
              href={`/sales/returns/new?sale_id=${centrixSaleId}`}
              className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#144a85]"
            >
              Create return / credit note
            </Link>
          ) : (
            <button
              type="button"
              disabled={materializing}
              onClick={handleMaterialize}
              className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#144a85] disabled:opacity-60"
            >
              {materializing ? "Copying…" : "Materialize into Centrix"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export function LegacyArchiveReportScreen() {
  const [status, setStatus] = useState(null);
  const [summary, setSummary] = useState(null);
  const [sales, setSales] = useState({ data: [], meta: {} });
  const [channel, setChannel] = useState("all");
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingSales, setLoadingSales] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSale, setSelectedSale] = useState(null);
  const [applied, setApplied] = useState({
    channel: "all",
    fromDate: defaultRange.from,
    toDate: defaultRange.to,
    q: "",
    page: 1,
  });

  useEffect(() => {
    fetchLegacyArchiveStatus()
      .then(setStatus)
      .catch((err) => setError(err?.message ?? "Could not load legacy archive status."))
      .finally(() => setLoadingStatus(false));
  }, []);

  const loadSales = useCallback(async () => {
    if (!applied.fromDate || !applied.toDate) {
      setSales({ data: [], meta: {} });
      setSummary(null);
      setLoadingSales(false);
      return;
    }

    setLoadingSales(true);
    setError(null);
    try {
      const [sumRes, list] = await Promise.all([
        fetchLegacyArchiveSummary({
          from_date: applied.fromDate,
          to_date: applied.toDate,
        }).catch(() => null),
        fetchLegacyArchiveSales({
          channel: applied.q ? "all" : applied.channel,
          page: applied.page,
          per_page: PAGE_SIZE,
          from_date: applied.fromDate,
          to_date: applied.toDate,
          ...(applied.q ? { q: applied.q } : {}),
        }),
      ]);
      setSummary(sumRes?.summary ?? null);
      setSales(list);
    } catch (err) {
      setError(err?.message ?? "Could not load legacy sales.");
      setSales({ data: [], meta: {} });
    } finally {
      setLoadingSales(false);
    }
  }, [applied]);

  useEffect(() => {
    loadSales();
  }, [loadSales]);

  const openSale = async (row) => {
    const saleDate = legacySaleDate(row);
    const rowChannel = row.archive_channel ?? row.channel ?? applied.channel;
    if (rowChannel === "all") return;
    try {
      const detail = await fetchLegacyArchiveSale(rowChannel, row.legacy_order_num, { sale_date: saleDate });
      setSelectedSale({ ...detail, archive_channel: rowChannel, channel: rowChannel });
    } catch {
      setSelectedSale({ ...row, archive_channel: rowChannel, channel: rowChannel });
    }
  };

  const handleMaterialized = (saleId) => {
    setSelectedSale((prev) => (prev ? { ...prev, materialized_sale_id: saleId } : prev));
    loadSales();
  };

  function applyFilters() {
    setPage(1);
    setApplied({ channel, fromDate, toDate, q, page: 1 });
  }

  function handlePageChange(nextPage) {
    setPage(nextPage);
    setApplied((prev) => ({ ...prev, page: nextPage }));
  }

  if (!loadingStatus && status && !status.enabled) {
    return (
      <div>
        <AdminBreadcrumb items={[{ label: "Reports", href: "/reports" }, { label: "Legacy archive" }]} />
        <h1 className="text-2xl font-semibold text-slate-900">Legacy sales archive</h1>
        <p className="mt-4 rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
          Legacy archive is not enabled for this organization. A platform administrator can turn it on under
          Organization settings → Legacy archive.
        </p>
      </div>
    );
  }

  const summaryCards = channelSummaryCards(summary);
  const salesMeta = sales.meta ?? {};
  const totalPages = salesMeta.last_page ?? 1;
  const total = salesMeta.total ?? 0;

  return (
    <div>
      <AdminBreadcrumb items={[{ label: "Reports", href: "/reports" }, { label: "Legacy archive" }]} />
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-900">Legacy sales archive</h1>
        <p className="mt-1 text-sm text-slate-500">
          Browse historical LightStores sales (read-only). Pick a date range — {PAGE_SIZE} sales load per page.
        </p>
        {status ? (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <ReportBadge
              label={status.available ? "Archive reachable" : "Archive unreachable"}
              tone={status.available ? "success" : "danger"}
            />
            {status.label ? <ReportBadge label={status.label} tone="neutral" /> : null}
            {status.counts
              ? Object.entries(status.counts).map(([key, count]) => (
                  <ReportBadge key={key} label={`${key.replace("sales_", "")}: ${count}`} tone="neutral" />
                ))
              : null}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      {summaryCards.length ? (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {summaryCards.map((row) => (
            <div key={row.channel} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs font-medium uppercase text-slate-500">
                {CHANNEL_LABELS[row.channel] ?? row.channel}
              </p>
              <p className="mt-1 text-xl font-semibold text-slate-900">{money(row.total_amount)}</p>
              <p className="text-xs text-slate-500">{row.sale_count} sales in range</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Channel</label>
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          >
            {CHANNELS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">From *</label>
          <input
            type="date"
            required
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">To *</label>
          <input
            type="date"
            required
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <div className="min-w-[12rem] flex-1">
          <label className="mb-1 block text-xs font-medium text-slate-500">Search</label>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Order # (P/M/D), customer, cashier…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="button"
          onClick={applyFilters}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white"
        >
          Apply
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Channel</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Created by</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3">In Centrix</th>
            </tr>
          </thead>
          <tbody>
            {loadingSales ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : (sales.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  {!applied.fromDate || !applied.toDate
                    ? "Set a from and to date, then click Apply."
                    : "No legacy sales for this filter."}
                </td>
              </tr>
            ) : (
              (sales.data ?? []).map((row) => (
                <tr
                  key={`${row.archive_channel ?? row.channel}-${row.legacy_order_num}-${row.legacy_sale_date ?? row.sale_date}`}
                  className="cursor-pointer border-b border-slate-100 hover:bg-slate-50"
                  onClick={() => openSale(row)}
                >
                  <td className="px-4 py-2.5">
                    <div className="font-medium text-[#185FA5]">{row.legacy_order_label ?? row.legacy_order_num}</div>
                    <span className="sr-only">#{row.legacy_order_num}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <ReportBadge
                      label={CHANNEL_LABELS[row.archive_channel ?? row.channel] ?? row.channel}
                      tone="neutral"
                    />
                  </td>
                  <td className="px-4 py-2.5">{legacySaleDate(row)}</td>
                  <td className="px-4 py-2.5">{row.customer_name ?? "—"}</td>
                  <td className="px-4 py-2.5">{row.created_by ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">{money(row.order_total)}</td>
                  <td className="px-4 py-2.5">
                    {row.materialized_sale_id ? (
                      <ReportBadge label="Yes" tone="success" />
                    ) : (
                      <ReportBadge label="Archive only" tone="neutral" />
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onChange={handlePageChange}
        />
      </div>

      {selectedSale ? (
        <SaleDetailDrawer
          sale={selectedSale}
          onClose={() => setSelectedSale(null)}
          onMaterialized={handleMaterialized}
        />
      ) : null}
    </div>
  );
}
