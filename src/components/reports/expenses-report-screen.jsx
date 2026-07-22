"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api"
import { fetchBranchesCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import {
  invalidateTabAwareDataLoad,
  markTabAwareDataLoaded,
  useTabAwareDataLoad,
  useTabPaneActive,
} from "@/contexts/tab-pane-activity-context";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { PaginationBar } from "@/components/catalog/catalog-shared";
import { formatReportCell, formatReportKes, sumField } from "@/lib/reports/format";
import { normalizeReportMeta, normalizeReportRows, normalizeReportSummary } from "@/lib/reports/api-response";
import {
  ReportFilterBar,
  ReportKpiGrid,
  ReportPageShell,
  ReportTable,
} from "@/components/reports/report-screen-shared";

const PAGE_SIZE = 25;
const CHART_COLORS = ["#185FA5", "#0F766E", "#B45309", "#7C3AED", "#BE123C", "#0369A1", "#4D7C0F"];

export function ExpensesReportScreen({ definition }) {
  const { user, capabilities } = useAuth();
  const { paneHref } = useTabPaneActive();
  const multiBranch = isMultiBranchCatalog(capabilities);
  const [rows, setRows] = useState([]);
  const [reportMeta, setReportMeta] = useState(null);
  const [reportSummary, setReportSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState([]);
  const [applied, setApplied] = useState({ fromDate: "", toDate: "", branchId: "" });

  useEffect(() => {
    fetchBranchesCached()
      .then((list) => setBranches(list ?? []))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (user?.branch_id && !branchId) setBranchId(String(user.branch_id));
  }, [user?.branch_id, branchId]);

  const appliedKey = useMemo(
    () => JSON.stringify({ fromDate: applied.fromDate, toDate: applied.toDate, branchId: applied.branchId }),
    [applied],
  );
  const depsKey = `${definition.apiPath}|${page}|${appliedKey}`;

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParams = {
        per_page: PAGE_SIZE,
        page,
        date_column: "expense_date",
      };
      if (applied.fromDate) searchParams.from_date = applied.fromDate;
      if (applied.toDate) searchParams.to_date = applied.toDate;
      if (applied.branchId) searchParams.branch_id = applied.branchId;
      const res = await apiRequest(definition.apiPath, { searchParams, loading: false });
      setRows(normalizeReportRows(res));
      setReportMeta(normalizeReportMeta(res, page, PAGE_SIZE));
      setReportSummary(normalizeReportSummary(res));
      markTabAwareDataLoaded(paneHref, depsKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setRows([]);
      setReportMeta(null);
      setReportSummary(null);
    } finally {
      setLoading(false);
    }
  }, [applied, definition.apiPath, page, paneHref, depsKey]);

  const hasData = rows.length > 0 || reportMeta != null;
  useTabAwareDataLoad(loadReport, { depsKey, hasData });

  function refreshReport() {
    invalidateTabAwareDataLoad(paneHref);
    void loadReport();
  }

  const byCategory = useMemo(() => {
    const groups = reportSummary?.by_group;
    if (Array.isArray(groups) && groups.length) {
      const total = groups.reduce((s, g) => s + (Number(g.total_amount) || 0), 0);
      return groups
        .map((g) => ({
          name: g.group_name ?? "Other",
          amount: Number(g.total_amount) || 0,
          pct: total > 0 ? ((Number(g.total_amount) || 0) / total) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);
    }
    const map = new Map();
    for (const row of rows) {
      const key = row.group_name ?? "Other";
      map.set(key, (map.get(key) ?? 0) + (Number(row.total_amount) || 0));
    }
    const total = [...map.values()].reduce((s, v) => s + v, 0);
    return [...map.entries()]
      .map(([name, amount]) => ({
        name,
        amount,
        pct: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [reportSummary, rows]);

  const totalPages = reportMeta?.last_page ?? 1;

  const kpis = definition.kpis?.map((kpi) => {
    const result = kpi.compute(rows, reportSummary);
    return { id: kpi.id, label: kpi.label, value: result.value };
  });

  const footerTotals = {};
  for (const col of definition.columns ?? []) {
    if (!col.total) continue;
    const value =
      reportSummary?.[col.key] != null
        ? Number(reportSummary[col.key]) || 0
        : sumField(rows, col.key);
    footerTotals[col.key] = formatReportCell(col.key, value);
  }

  const branchLabel = branches.find((b) => String(b.id) === applied.branchId)?.branch_name
    ?? (applied.branchId ? "" : "All branches");

  return (
    <ReportPageShell
      section={definition.section}
      title={definition.title}
      subtitle={definition.subtitle}
      exportConfig={{
        filename: definition.key ?? "expenses",
        columns: (definition.columns ?? []).map((col) => ({
          ...col,
          accessor: (row) => formatReportCell(col.key, col.accessor(row)),
        })),
        exportSource: {
          path: definition.apiPath,
          searchParams: {
            date_column: "expense_date",
            ...(applied.fromDate ? { from_date: applied.fromDate } : {}),
            ...(applied.toDate ? { to_date: applied.toDate } : {}),
            ...(applied.branchId ? { branch_id: applied.branchId } : {}),
          },
        },
        meta: {
          fromDate: applied.fromDate,
          toDate: applied.toDate,
          branchName: branchLabel,
        },
        footerRow: Object.keys(footerTotals).length ? footerTotals : null,
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
        onFilter={() => {
          setPage(1);
          setApplied({ fromDate, toDate, branchId });
        }}
        onRefresh={() => void refreshReport()}
        onReset={() => {
          const bid = user?.branch_id ? String(user.branch_id) : "";
          setFromDate("");
          setToDate("");
          setBranchId(bid);
          setPage(1);
          setApplied({ fromDate: "", toDate: "", branchId: bid });
        }}
        loading={loading}
        showBranchFilter={multiBranch}
      />

      {!loading ? <ReportKpiGrid items={kpis ?? []} /> : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading report…</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="theme-panel rounded-xl border p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900">By category</h2>
            <div className="mt-4 space-y-3">
              {byCategory.map((item, idx) => (
                <div key={item.name}>
                  <div className="mb-1 flex justify-between text-xs text-slate-600">
                    <span>{item.name}</span>
                    <span>{item.pct.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${item.pct}%`,
                        backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
                      }}
                    />
                  </div>
                  <p className="mt-0.5 text-right text-xs font-medium text-slate-800">
                    {formatReportKes(item.amount)}
                  </p>
                </div>
              ))}
              {!byCategory.length ? (
                <p className="text-xs text-slate-500">No expense categories in range.</p>
              ) : null}
            </div>
          </div>
          <div>
            <ReportTable columns={definition.columns ?? []} rows={rows} footerTotals={footerTotals} />
            <PaginationBar
              page={page}
              totalPages={totalPages}
              total={reportMeta?.total ?? rows.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </div>
        </div>
      )}
    </ReportPageShell>
  );
}
