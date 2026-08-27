"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { notifyError } from "@/lib/notify";
import {
  Field,
  SECONDARY_BTN_CLASS,
  StatCard,
  formatKesCompact,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";

export const INVESTOR_REPORT_KINDS = [
  { id: "sales", label: "Sales & profit" },
  { id: "stock", label: "Stock balance" },
  { id: "money-flow", label: "Money flow" },
];

function paymentBadge(status) {
  const s = String(status || "unpaid").toLowerCase();
  const cls =
    s === "paid"
      ? "bg-emerald-100 text-emerald-800"
      : s === "partial"
        ? "bg-amber-100 text-amber-800"
        : "bg-rose-100 text-rose-800";
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${cls}`}>
      {s}
    </span>
  );
}

/**
 * Standalone investor report body (sales / stock / money-flow).
 *
 * @param {object} props
 * @param {string|number} props.investorId
 * @param {{ investor_name?: string, investor_code?: string } | null} [props.investor]
 * @param {boolean} props.canView
 * @param {string} [props.initialKind]
 */
export function InvestorReportsView({
  investorId,
  investor = null,
  canView,
  initialKind = "sales",
}) {
  const [reportKind, setReportKind] = useState(() => {
    const kind = String(initialKind || "sales");
    return INVESTOR_REPORT_KINDS.some((k) => k.id === kind) ? kind : "sales";
  });
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [report, setReport] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    const kind = String(initialKind || "sales");
    if (INVESTOR_REPORT_KINDS.some((k) => k.id === kind)) {
      setReportKind(kind);
    }
  }, [initialKind]);

  const loadReport = useCallback(async () => {
    if (!canView || !investorId) return;
    setReportLoading(true);
    try {
      const search = {};
      if (fromDate) search.from_date = fromDate;
      if (toDate) search.to_date = toDate;
      const path =
        reportKind === "stock"
          ? `/investors/${investorId}/reports/stock`
          : reportKind === "money-flow"
            ? `/investors/${investorId}/reports/money-flow`
            : `/investors/${investorId}/reports/sales`;
      const data = await apiRequest(path, { searchParams: search });
      setReport(data);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load report");
      setReport(null);
    } finally {
      setReportLoading(false);
    }
  }, [canView, fromDate, toDate, investorId, reportKind]);

  useEffect(() => {
    if (canView) void loadReport();
  }, [canView, loadReport]);

  const reportTotals = useMemo(() => report?.totals ?? {}, [report]);

  const reportExportConfig = useMemo(() => {
    const kindLabel = INVESTOR_REPORT_KINDS.find((k) => k.id === reportKind)?.label ?? "Report";
    const investorSlug = String(investor?.investor_code || investorId || "investor").replace(
      /\s+/g,
      "-",
    );
    if (reportKind === "stock") {
      const rows = report?.rows ?? [];
      return {
        title: `${kindLabel} — ${investor?.investor_name || investorSlug}`,
        filename: `investor-${investorSlug}-stock`,
        columns: [
          { key: "product_name", label: "Product" },
          { key: "product_code", label: "Code" },
          { key: "qty_purchased", label: "Purchased", align: "right" },
          { key: "qty_sold", label: "Sold", align: "right" },
          { key: "qty_remaining", label: "Remaining", align: "right" },
          { key: "unit_cost", label: "Unit cost", align: "right" },
          { key: "stock_value", label: "Stock value", align: "right" },
        ],
        totalCount: rows.length,
        getInlineRows: async () =>
          rows.map((row) => ({
            product_name: row.product_name || "",
            product_code: row.product_code || "",
            qty_purchased: row.qty_purchased ?? "",
            qty_sold: row.qty_sold ?? "",
            qty_remaining: row.qty_remaining ?? "",
            unit_cost: row.unit_cost ?? "",
            stock_value: row.stock_value ?? "",
          })),
      };
    }
    if (reportKind === "money-flow") {
      const events = report?.events ?? [];
      return {
        title: `${kindLabel} — ${investor?.investor_name || investorSlug}`,
        filename: `investor-${investorSlug}-money-flow`,
        columns: [
          { key: "date", label: "Date" },
          { key: "label", label: "Event" },
          { key: "in", label: "In", align: "right" },
          { key: "out", label: "Out", align: "right" },
          { key: "balance", label: "Balance", align: "right" },
        ],
        totalCount: events.length,
        getInlineRows: async () =>
          events.map((ev) => ({
            date: ev.date || "",
            label: ev.label || "",
            in: ev.in ?? "",
            out: ev.out ?? "",
            balance: ev.balance ?? "",
          })),
      };
    }
    const lines = report?.lines ?? [];
    return {
      title: `${kindLabel} — ${investor?.investor_name || investorSlug}`,
      filename: `investor-${investorSlug}-sales`,
      columns: [
        { key: "invoice_label", label: "Invoice" },
        { key: "sale_date", label: "Date" },
        { key: "product_name", label: "Product" },
        { key: "quantity_sold", label: "Qty", align: "right" },
        { key: "sales_value", label: "Sales", align: "right" },
        { key: "cost_value", label: "Cost", align: "right" },
        { key: "profit", label: "Profit", align: "right" },
        { key: "payment_status", label: "Payment" },
      ],
      totalCount: lines.length,
      getInlineRows: async () =>
        lines.map((line) => ({
          invoice_label: line.invoice_label || "",
          sale_date: line.sale_date || "",
          product_name: line.product_name || "",
          quantity_sold: line.quantity_sold ?? "",
          sales_value: line.sales_value ?? "",
          cost_value: line.cost_value ?? "",
          profit: line.profit ?? "",
          payment_status: line.payment_status || "",
        })),
    };
  }, [report, reportKind, investor, investorId]);

  if (!canView) {
    return (
      <p className="text-sm text-slate-600">You do not have permission to view investor reports.</p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-1">
          {INVESTOR_REPORT_KINDS.map((k) => (
            <button
              key={k.id}
              type="button"
              onClick={() => setReportKind(k.id)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                reportKind === k.id
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
        {reportKind !== "stock" ? (
          <>
            <Field label="From">
              <input
                type="date"
                className={inputClassName()}
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </Field>
            <Field label="To">
              <input
                type="date"
                className={inputClassName()}
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </Field>
          </>
        ) : null}
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          onClick={() => void loadReport()}
          disabled={reportLoading}
        >
          {reportLoading ? "Loading…" : "Refresh"}
        </button>
        <CatalogListExport
          title={reportExportConfig.title}
          filename={reportExportConfig.filename}
          columns={reportExportConfig.columns}
          totalCount={reportExportConfig.totalCount}
          getInlineRows={reportExportConfig.getInlineRows}
          disabled={reportLoading || !report || reportExportConfig.totalCount === 0}
        />
      </div>

      {reportLoading && !report ? (
        <p className="text-sm text-slate-500">Loading report…</p>
      ) : null}

      {reportKind === "sales" && report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Sales" value={formatKesCompact(reportTotals.sales_value ?? 0)} />
            <StatCard label="Cost" value={formatKesCompact(reportTotals.cost_value ?? 0)} />
            <StatCard
              label="Gross profit"
              value={formatKesCompact(reportTotals.gross_profit ?? 0)}
            />
            <StatCard label="Expenses" value={formatKesCompact(reportTotals.expenses ?? 0)} />
            <StatCard label="Net profit" value={formatKesCompact(reportTotals.net_profit ?? 0)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Paid sales" value={formatKesCompact(reportTotals.paid_sales ?? 0)} />
            <StatCard
              label="Partial sales"
              value={formatKesCompact(reportTotals.partial_sales ?? 0)}
            />
            <StatCard
              label="Unpaid sales"
              value={formatKesCompact(reportTotals.unpaid_sales ?? 0)}
            />
          </div>
          <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <th className="px-3 py-2">Invoice</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Sales</th>
                    <th className="px-3 py-2 text-right">Cost</th>
                    <th className="px-3 py-2 text-right">Profit</th>
                    <th className="px-3 py-2">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.lines ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-10 text-center text-slate-500">
                        No attributed sales in this period.
                      </td>
                    </tr>
                  ) : (
                    (report.lines ?? []).map((line, idx) => (
                      <tr
                        key={`${line.sale_id}-${line.product_code}-${idx}`}
                        className="theme-table-row border-t border-slate-100"
                      >
                        <td className="px-3 py-2 font-mono text-xs">{line.invoice_label}</td>
                        <td className="px-3 py-2">{formatShortDate(line.sale_date)}</td>
                        <td className="px-3 py-2">{line.product_name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{line.quantity_sold}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatKesCompact(line.sales_value)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatKesCompact(line.cost_value)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatKesCompact(line.profit)}
                        </td>
                        <td className="px-3 py-2">{paymentBadge(line.payment_status)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {reportKind === "stock" && report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Qty purchased" value={reportTotals.qty_purchased ?? 0} />
            <StatCard label="Qty remaining" value={reportTotals.qty_remaining ?? 0} />
            <StatCard
              label="Stock value"
              value={formatKesCompact(reportTotals.stock_value ?? 0)}
            />
          </div>
          <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <th className="px-3 py-2">Product</th>
                    <th className="px-3 py-2 text-right">Purchased</th>
                    <th className="px-3 py-2 text-right">Sold</th>
                    <th className="px-3 py-2 text-right">Remaining</th>
                    <th className="px-3 py-2 text-right">Unit cost</th>
                    <th className="px-3 py-2 text-right">Stock value</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.rows ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                        No batches.
                      </td>
                    </tr>
                  ) : (
                    (report.rows ?? []).map((row) => (
                      <tr key={row.batch_id} className="theme-table-row border-t border-slate-100">
                        <td className="px-3 py-2">
                          <div className="font-medium">{row.product_name || row.product_code}</div>
                          <div className="font-mono text-xs text-slate-500">{row.product_code}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.qty_purchased}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.qty_sold}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{row.qty_remaining}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatKesCompact(row.unit_cost)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatKesCompact(row.stock_value)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}

      {reportKind === "money-flow" && report ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Net profit"
              value={formatKesCompact(report.summary?.net_profit ?? 0)}
            />
            <StatCard
              label="Cash pool"
              value={formatKesCompact(report.summary?.cash_pool_balance ?? 0)}
            />
            <StatCard
              label="Stock value"
              value={formatKesCompact(report.summary?.stock_value ?? 0)}
            />
            <StatCard
              label="Sales value"
              value={formatKesCompact(report.summary?.sales_value ?? 0)}
            />
          </div>
          <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Event</th>
                    <th className="px-3 py-2 text-right">In</th>
                    <th className="px-3 py-2 text-right">Out</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.events ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                        No money-flow events.
                      </td>
                    </tr>
                  ) : (
                    (report.events ?? []).map((ev, idx) => (
                      <tr
                        key={`${ev.type}-${ev.reference_id}-${idx}`}
                        className="theme-table-row border-t border-slate-100"
                      >
                        <td className="px-3 py-2">{formatShortDate(ev.date)}</td>
                        <td className="px-3 py-2">{ev.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                          {ev.in ? formatKesCompact(ev.in) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-rose-700">
                          {ev.out ? formatKesCompact(ev.out) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {formatKesCompact(ev.balance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
