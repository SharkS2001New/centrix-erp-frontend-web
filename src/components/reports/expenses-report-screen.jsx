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
import { formatReportCell, sumField } from "@/lib/reports/format";
import { normalizeReportMeta, normalizeReportRows, normalizeReportSummary } from "@/lib/reports/api-response";
import {
  ReportFilterBar,
  ReportKpiGrid,
  ReportPageShell,
  ReportTable,
} from "@/components/reports/report-screen-shared";
import { ReportChartsSection, ReportViewModeToggle } from "@/components/reports/report-charts";
import { useListPageSize } from "@/lib/use-list-page-controls";

const DEFAULT_PAGE_SIZE = 25;

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
  const { pageSize, setPageSize } = useListPageSize(DEFAULT_PAGE_SIZE);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState([]);
  const [applied, setApplied] = useState({ fromDate: "", toDate: "", branchId: "" });
  const [viewMode, setViewMode] = useState("both");

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
  const depsKey = `${definition.apiPath}|${page}|${pageSize}|${appliedKey}`;

  function handlePageSizeChange(next) {
    setPageSize(next);
    setPage(1);
  }

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParams = {
        per_page: pageSize,
        page,
        date_column: "expense_date",
      };
      if (applied.fromDate) searchParams.from_date = applied.fromDate;
      if (applied.toDate) searchParams.to_date = applied.toDate;
      if (applied.branchId) searchParams.branch_id = applied.branchId;
      const res = await apiRequest(definition.apiPath, { searchParams, loading: false });
      setRows(normalizeReportRows(res));
      setReportMeta(normalizeReportMeta(res, page, pageSize));
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
  }, [applied, definition.apiPath, page, pageSize, paneHref, depsKey]);

  const hasData = rows.length > 0 || reportMeta != null;
  useTabAwareDataLoad(loadReport, { depsKey, hasData });

  function refreshReport() {
    invalidateTabAwareDataLoad(paneHref);
    void loadReport();
  }

  const byCategory = useMemo(() => {
    const groups = reportSummary?.by_group;
    if (Array.isArray(groups) && groups.length) {
      return groups.map((g) => ({
        group_name: g.group_name ?? "Other",
        total_amount: Number(g.total_amount) || 0,
      }));
    }
    const map = new Map();
    for (const row of rows) {
      const key = row.group_name ?? "Other";
      map.set(key, (map.get(key) ?? 0) + (Number(row.total_amount) || 0));
    }
    return [...map.entries()].map(([group_name, total_amount]) => ({
      group_name,
      total_amount,
    }));
  }, [reportSummary, rows]);

  const totalPages = reportMeta?.last_page ?? 1;
  const hasCharts = Boolean(definition.charts?.length);
  const showCharts = hasCharts && (viewMode === "charts" || viewMode === "both");
  const showTable = viewMode === "table" || viewMode === "both" || !hasCharts;

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
      onRefresh={() => void refreshReport()}
      refreshLoading={loading}
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

      {!loading && hasCharts ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-slate-800">
              {viewMode === "charts"
                ? "Graphs & charts"
                : viewMode === "both"
                  ? "Table with graphs"
                  : "Data table"}
            </p>
            <p className="text-xs text-slate-500">
              Switch views to compare expense categories as charts or a table.
            </p>
          </div>
          <ReportViewModeToggle value={viewMode} onChange={setViewMode} disabled={loading} />
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading report…</p>
      ) : (
        <>
          {showCharts ? (
            <ReportChartsSection
              charts={definition.charts}
              rows={byCategory.length ? byCategory : rows}
            />
          ) : null}
          {showTable ? (
            <>
              <ReportTable columns={definition.columns ?? []} rows={rows} footerTotals={footerTotals} />
              <PaginationBar
                page={page}
                totalPages={totalPages}
                total={reportMeta?.total ?? rows.length}
                pageSize={pageSize}
                onChange={setPage}
                onPageSizeChange={handlePageSizeChange}
              />
            </>
          ) : null}
        </>
      )}
    </ReportPageShell>
  );
}
