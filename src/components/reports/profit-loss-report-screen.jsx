"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { fetchBranchesCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import {
  invalidateTabAwareDataLoad,
  markTabAwareDataLoaded,
  useTabAwareDataLoad,
  useTabPaneActive,
} from "@/contexts/tab-pane-activity-context";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { todayDashboardDateRange } from "@/lib/dashboard-dates";
import { formatReportKes } from "@/lib/reports/format";
import {
  ReportFilterBar,
  ReportKpiGrid,
  ReportPageShell,
} from "@/components/reports/report-screen-shared";

function pct(part, whole) {
  if (!whole) return "—";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function initialBranchId(user, isOrgWide) {
  if (!user || isOrgWide?.()) return "";
  return user.branch_id ? String(user.branch_id) : "";
}

export function ProfitLossReportScreen({ definition }) {
  const { user, capabilities, isOrgWide } = useAuth();
  const { paneHref } = useTabPaneActive();
  const multiBranch = isMultiBranchCatalog(capabilities);
  const defaultRange = useMemo(() => todayDashboardDateRange(), []);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState([]);
  const [applied, setApplied] = useState({
    fromDate: defaultRange.from,
    toDate: defaultRange.to,
    branchId: "",
  });
  const [filtersReady, setFiltersReady] = useState(false);
  const orgWide = Boolean(isOrgWide?.());

  useEffect(() => {
    fetchBranchesCached()
      .then((list) => setBranches(list ?? []))
      .catch(() => setBranches([]));
  }, []);

  // Resolve branch scope once auth is available, then load (avoids all-branch scan then re-fetch).
  useEffect(() => {
    if (!user || filtersReady) return;
    const bid = orgWide ? "" : user.branch_id ? String(user.branch_id) : "";
    setBranchId(bid);
    setApplied((prev) => (prev.branchId === bid ? prev : { ...prev, branchId: bid }));
    setFiltersReady(true);
  }, [user, orgWide, filtersReady]);

  const appliedKey = useMemo(
    () => JSON.stringify({ fromDate: applied.fromDate, toDate: applied.toDate, branchId: applied.branchId }),
    [applied],
  );
  const depsKey = `${definition.apiPath}|${appliedKey}|${filtersReady ? 1 : 0}`;

  const loadReport = useCallback(async () => {
    if (!filtersReady) return;
    setLoading(true);
    setError(null);
    try {
      const searchParams = { per_page: 1, page: 1, date_column: "period" };
      if (applied.fromDate) searchParams.from_date = applied.fromDate;
      if (applied.toDate) searchParams.to_date = applied.toDate;
      if (applied.branchId) searchParams.branch_id = applied.branchId;
      // Page-local spinner only — do not hold the global shell overlay on this report.
      const res = await apiRequest(definition.apiPath, { searchParams, loading: false });
      setRows(res.data ?? []);
      markTabAwareDataLoaded(paneHref, depsKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [applied, definition.apiPath, filtersReady, paneHref, depsKey]);

  const hasData = rows.length > 0 || (!loading && filtersReady);
  useTabAwareDataLoad(loadReport, { depsKey, hasData });

  function refreshReport() {
    invalidateTabAwareDataLoad(paneHref);
    void loadReport();
  }

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => ({
        gross_revenue: acc.gross_revenue + (Number(row.gross_revenue) || 0),
        net_revenue: acc.net_revenue + (Number(row.net_revenue) || 0),
        cogs: acc.cogs + (Number(row.cogs) || 0),
        gross_profit: acc.gross_profit + (Number(row.gross_profit) || 0),
        total_expenses: acc.total_expenses + (Number(row.total_expenses) || 0),
        net_profit: acc.net_profit + (Number(row.net_profit) || 0),
      }),
      { gross_revenue: 0, net_revenue: 0, cogs: 0, gross_profit: 0, total_expenses: 0, net_profit: 0 },
    );
  }, [rows]);

  const statementRows = [
    { label: "Gross Sales", amount: totals.gross_revenue, bold: true },
    { label: "Net Revenue (ex VAT)", amount: totals.net_revenue },
    { label: "Cost of Goods Sold", amount: -totals.cogs },
    { label: "Gross Profit", amount: totals.gross_profit, bold: true, highlight: true },
    { label: "Operating Expenses", amount: -totals.total_expenses },
    { label: "Net Profit", amount: totals.net_profit, bold: true, highlight: true },
  ];

  const grossMargin = totals.gross_revenue > 0 ? (totals.gross_profit / totals.gross_revenue) * 100 : null;
  const netMargin = totals.gross_revenue > 0 ? (totals.net_profit / totals.gross_revenue) * 100 : null;

  const kpis = [
    { id: "revenue", label: "Gross Sales", value: formatReportKes(totals.gross_revenue) },
    {
      id: "gp",
      label: "Gross Profit",
      value: formatReportKes(totals.gross_profit),
      hint: grossMargin != null ? `${grossMargin.toFixed(1)}% margin` : undefined,
    },
    { id: "expenses", label: "Expenses", value: formatReportKes(totals.total_expenses) },
    {
      id: "net",
      label: "Net Profit",
      value: formatReportKes(totals.net_profit),
      hint: netMargin != null ? `${netMargin.toFixed(1)}% of sales` : undefined,
    },
  ];

  const branchLabel = branches.find((b) => String(b.id) === applied.branchId)?.branch_name
    ?? (applied.branchId ? "" : "All branches");

  const periodLabel =
    applied.fromDate && applied.toDate
      ? `${applied.fromDate} → ${applied.toDate}`
      : applied.fromDate || applied.toDate || "All dates";

  const exportColumns = [
    { key: "label", label: "Particulars", accessor: (row) => row.label },
    {
      key: "amount",
      label: "This Period",
      align: "right",
      accessor: (row) => `${formatReportKes(Math.abs(row.amount))}${row.amount < 0 ? " (Dr)" : ""}`,
    },
    {
      key: "pct",
      label: "% of Sales",
      align: "right",
      accessor: (row) => pct(Math.abs(row.amount), totals.gross_revenue),
    },
  ];

  // Materialize accessors for server-side print/PDF (toolbar strips accessors).
  const exportRows = statementRows.map((row) => ({
    label: row.label,
    amount: `${formatReportKes(Math.abs(row.amount))}${row.amount < 0 ? " (Dr)" : ""}`,
    pct: pct(Math.abs(row.amount), totals.gross_revenue),
  }));

  const hasActivity =
    totals.gross_revenue !== 0 ||
    totals.cogs !== 0 ||
    totals.total_expenses !== 0 ||
    totals.net_profit !== 0;

  return (
    <ReportPageShell
      section={definition.section}
      title={definition.title}
      subtitle={`${definition.subtitle} · ${periodLabel}`}
      exportConfig={{
        filename: definition.key ?? "profit-loss",
        columns: exportColumns,
        getRows: async () => exportRows,
        meta: {
          fromDate: applied.fromDate,
          toDate: applied.toDate,
          branchName: branchLabel,
        },
        disabled: loading,
      }}
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <ReportFilterBar
        fromDate={fromDate}
        toDate={toDate}
        branchId={branchId}
        branches={branches}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onBranchChange={setBranchId}
        onExtraChange={() => {}}
        onFilter={() => setApplied({ fromDate, toDate, branchId })}
        onRefresh={() => void refreshReport()}
        onReset={() => {
          const range = todayDashboardDateRange();
          const bid = initialBranchId(user, isOrgWide);
          setFromDate(range.from);
          setToDate(range.to);
          setBranchId(bid);
          setApplied({ fromDate: range.from, toDate: range.to, branchId: bid });
        }}
        loading={loading}
        showBranchFilter={multiBranch}
      />

      {!loading ? <ReportKpiGrid items={kpis} /> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading report…</p>
      ) : !hasActivity ? (
        <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center text-sm text-slate-500">
          No profit &amp; loss activity for this period. Try widening the date range.
        </p>
      ) : (
        <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3 text-sm text-slate-600">
            Operational P&amp;L from sales, receipts (COGS proxy), and expenses
            {multiBranch ? ` · ${branchLabel}` : ""}
          </div>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="theme-table-head-row text-left text-xs font-semibold uppercase tracking-wide">
                <th className="px-4 py-3">Particulars</th>
                <th className="px-4 py-3 text-right">This Period</th>
                <th className="px-4 py-3 text-right">% of Sales</th>
              </tr>
            </thead>
            <tbody>
              {statementRows.map((row) => (
                <tr
                  key={row.label}
                  className={`border-b border-slate-100 ${row.highlight ? "bg-slate-50" : ""}`}
                >
                  <td className={`px-4 py-3 text-slate-800 ${row.bold ? "font-semibold" : ""}`}>{row.label}</td>
                  <td
                    className={`px-4 py-3 text-right tabular-nums ${row.bold ? "font-semibold" : ""} ${
                      row.amount < 0 ? "text-red-700" : row.highlight ? "text-emerald-800" : ""
                    }`}
                  >
                    {formatReportKes(Math.abs(row.amount))}
                    {row.amount < 0 ? " (Dr)" : ""}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">
                    {pct(Math.abs(row.amount), totals.gross_revenue)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ReportPageShell>
  );
}
