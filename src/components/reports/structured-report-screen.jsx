"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { useReportRefreshUi } from "@/lib/list-refresh-ui";
import { formatReportCell } from "@/lib/reports/format";
import { isInventoryQtyField, isLpoPackQtyField } from "@/lib/inventory-qty-display";
import { loadFullReportDataset } from "@/lib/paginated-fetch";
import {
  ReportFilterBar,
  ReportKpiGrid,
  ReportPageShell,
  ReportTable,
} from "@/components/reports/report-screen-shared";
import { AiInsightPanel } from "@/components/ai/ai-insight-panel";
import { normalizeReportMeta, normalizeReportRows, normalizeReportSummary } from "@/lib/reports/api-response";
import { defaultReportBranchId, defaultReportDateRange } from "@/lib/reports/report-filters";
import {
  buildReportQueryParams,
  reportHidesBranchFilter,
  reportShowsDateRange,
  defaultReportExtraFilterValues,
  reportDefaultDateRangeDays,
  REPORT_DEFAULT_DATE_RANGE_DAYS,
} from "@/lib/reports/report-filter-config";
import { useReportFilterOptions } from "@/lib/reports/use-report-filter-options";
import { ProfitLossReportScreen } from "@/components/reports/profit-loss-report-screen";
import { ExpensesReportScreen } from "@/components/reports/expenses-report-screen";
import { KraReceiptsReportScreen } from "@/components/reports/kra-receipts-report-screen";
import { KraFailureReasonDialog } from "@/components/reports/kra-failure-reason-dialog";
import { snippetKraErrorReason } from "@/lib/kra-device-errors";
import { ReportChartsSection, ReportViewModeToggle } from "@/components/reports/report-charts";
import { filterStructuredReportColumns } from "@/lib/reports/report-column-visibility";
import { filterStockMovementRows } from "@/lib/reports/report-row-filters";
import { clearTabPaneCache, readTabPaneCache, writeTabPaneCache } from "@/lib/tab-pane-session-cache";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { getReportsDefaultDateRange } from "@/lib/sales-settings";

const DEFAULT_PAGE_SIZE = 20;
const CACHE_SLOT = "structured-report";

export function StructuredReportScreen({ definition }) {
  if (definition.variant === "profit-loss") {
    return <ProfitLossReportScreen definition={definition} />;
  }
  if (definition.variant === "expenses") {
    return <ExpensesReportScreen definition={definition} />;
  }
  if (definition.variant === "kra-receipts" || definition.variant === "kra-invoices") {
    return <KraReceiptsReportScreen definition={definition} />;
  }

  return <StandardReportScreen definition={definition} />;
}

function StandardReportScreen({ definition }) {
  const { user, isOrgWide, capabilities } = useAuth();
  const { paneHref } = useTabPaneActive();
  const capabilitiesRef = useRef(capabilities);
  useEffect(() => {
    capabilitiesRef.current = capabilities;
  }, [capabilities]);
  const multiBranch = isMultiBranchCatalog(capabilities);
  const resolveDefaultRange = useCallback(() => {
    if (definition.emptyDateRange) {
      return { from: "", to: "" };
    }
    if (definition.defaultDateRangeDays != null) {
      return defaultReportDateRange(definition.defaultDateRangeDays);
    }
    if (Object.prototype.hasOwnProperty.call(REPORT_DEFAULT_DATE_RANGE_DAYS, definition.key)) {
      return defaultReportDateRange(
        reportDefaultDateRangeDays(definition.key, capabilities?.module_settings),
      );
    }
    return getReportsDefaultDateRange(capabilities?.module_settings);
  }, [
    definition.defaultDateRangeDays,
    definition.emptyDateRange,
    definition.key,
    capabilities?.module_settings,
  ]);
  const defaultRange = useMemo(() => resolveDefaultRange(), [resolveDefaultRange]);
  const branchInitialized = useRef(false);

  const cachedBundle = paneHref ? readTabPaneCache(paneHref, CACHE_SLOT) : null;
  const cacheMatchesDefinition =
    cachedBundle &&
    cachedBundle.reportKey === definition.key &&
    cachedBundle.apiPath === definition.apiPath;

  const [rows, setRows] = useState(() => (cacheMatchesDefinition ? cachedBundle.rows ?? [] : []));
  const [reportMeta, setReportMeta] = useState(() =>
    cacheMatchesDefinition ? cachedBundle.reportMeta ?? null : null,
  );
  const [reportSummary, setReportSummary] = useState(() =>
    cacheMatchesDefinition ? cachedBundle.reportSummary ?? null : null,
  );
  const [loading, setLoading] = useState(
    () => !(cacheMatchesDefinition && (cachedBundle.rows?.length || cachedBundle.reportMeta)),
  );
  const [error, setError] = useState(null);
  const [page, setPage] = useState(() => (cacheMatchesDefinition ? cachedBundle.page ?? 1 : 1));
  const { pageSize, setPageSize } = useListPageSize(DEFAULT_PAGE_SIZE);
  const [fromDate, setFromDate] = useState(() =>
    cacheMatchesDefinition ? cachedBundle.fromDate ?? defaultRange.from : defaultRange.from,
  );
  const [toDate, setToDate] = useState(() =>
    cacheMatchesDefinition ? cachedBundle.toDate ?? defaultRange.to : defaultRange.to,
  );
  const [branchId, setBranchId] = useState(() =>
    cacheMatchesDefinition ? cachedBundle.branchId ?? "" : "",
  );
  const [branches, setBranches] = useState([]);
  const defaultExtraFilters = useMemo(
    () => defaultReportExtraFilterValues(definition.key, definition.extraFilters),
    [definition.extraFilters, definition.key],
  );

  const [extraFilters, setExtraFilters] = useState(() =>
    cacheMatchesDefinition
      ? { ...defaultExtraFilters, ...(cachedBundle.extraFilters ?? {}) }
      : defaultExtraFilters,
  );
  const [queryFilters, setQueryFilters] = useState(() =>
    cacheMatchesDefinition ? cachedBundle.queryFilters ?? {} : {},
  );
  const [aiOpen, setAiOpen] = useState(false);
  const [failureReasonRow, setFailureReasonRow] = useState(null);
  const [viewMode, setViewMode] = useState("table");
  const [chartRows, setChartRows] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartTruncated, setChartTruncated] = useState(false);
  const chartCacheKeyRef = useRef("");
  const MAX_CHART_ROWS = 2000;
  const [applied, setApplied] = useState(() =>
    cacheMatchesDefinition && cachedBundle.applied
      ? cachedBundle.applied
      : {
          fromDate: defaultRange.from,
          toDate: defaultRange.to,
          branchId: cacheMatchesDefinition ? cachedBundle.branchId ?? "" : "",
          extraFilters: defaultExtraFilters,
          queryFilters: {},
        },
  );
  const filterOptions = useReportFilterOptions(definition.key);

  useEffect(() => {
    fetchBranchesCached()
      .then((list) => setBranches(list ?? []))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (!user || branchInitialized.current) return;
    branchInitialized.current = true;
    if (cacheMatchesDefinition && (cachedBundle?.applied?.branchId != null || cachedBundle?.branchId != null)) {
      return;
    }
    const nextBranchId = defaultReportBranchId(user, isOrgWide);
    setBranchId(nextBranchId);
    setApplied((prev) => (prev.branchId === nextBranchId ? prev : { ...prev, branchId: nextBranchId }));
  }, [user, isOrgWide, cacheMatchesDefinition, cachedBundle]);

  const appliedKey = useMemo(
    () =>
      JSON.stringify({
        fromDate: applied.fromDate,
        toDate: applied.toDate,
        branchId: applied.branchId,
        extraFilters: applied.extraFilters,
        queryFilters: applied.queryFilters,
      }),
    [applied],
  );
  const appliedRef = useRef(applied);
  const filterRowsRef = useRef(definition.filterRows);
  useEffect(() => {
    appliedRef.current = applied;
    filterRowsRef.current = definition.filterRows;
  }, [applied, definition.filterRows]);

  const depsKey = `${definition.key}|${definition.apiPath}|${page}|${pageSize}|${appliedKey}`;

  useLayoutEffect(() => {
    if (cacheMatchesDefinition && cachedBundle?.depsKey === depsKey) {
      markTabAwareDataLoaded(paneHref, depsKey);
    }
  }, [cacheMatchesDefinition, cachedBundle?.depsKey, depsKey, paneHref]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    const currentApplied = appliedRef.current;
    try {
      const searchParams = {
        per_page: pageSize,
        page,
        ...buildReportQueryParams(definition.key, {
          fromDate: currentApplied.fromDate,
          toDate: currentApplied.toDate,
          branchId: currentApplied.branchId,
          extraValues: currentApplied.queryFilters,
        }),
      };
      if (definition.dateColumn && !searchParams.date_column && reportShowsDateRange(definition.key)) {
        searchParams.date_column = definition.dateColumn;
      }
      const res = await apiRequest(definition.apiPath, { searchParams, loading: false });
      let centrixRows = normalizeReportRows(res);
      if (filterRowsRef.current) {
        centrixRows = filterRowsRef.current(centrixRows, currentApplied.extraFilters);
      }
      if (definition.key === "stock-movement") {
        centrixRows = filterStockMovementRows(centrixRows, capabilitiesRef.current);
      }
      const meta = normalizeReportMeta(res, page, pageSize);
      const summary = normalizeReportSummary(res);
      setRows(centrixRows);
      setReportMeta(meta);
      setReportSummary(summary);
      writeTabPaneCache(paneHref, CACHE_SLOT, {
        reportKey: definition.key,
        apiPath: definition.apiPath,
        rows: centrixRows,
        reportMeta: meta,
        reportSummary: summary,
        page,
        fromDate: currentApplied.fromDate,
        toDate: currentApplied.toDate,
        branchId: currentApplied.branchId,
        extraFilters: currentApplied.extraFilters,
        queryFilters: currentApplied.queryFilters,
        applied: currentApplied,
        depsKey,
      });
      markTabAwareDataLoaded(paneHref, depsKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setRows([]);
      setReportMeta(null);
      setReportSummary(null);
    } finally {
      setLoading(false);
    }
  }, [definition.key, definition.apiPath, definition.dateColumn, page, pageSize, paneHref, depsKey]);

  function handlePageSizeChange(next) {
    setPageSize(next);
    setPage(1);
  }

  const hasData =
    rows.length > 0 ||
    reportMeta != null ||
    Boolean(cacheMatchesDefinition && cachedBundle?.depsKey === depsKey);

  useTabAwareDataLoad(loadReport, { depsKey, hasData });

  function refreshReport() {
    clearTabPaneCache(paneHref, CACHE_SLOT);
    invalidateTabAwareDataLoad(paneHref);
    void loadReport();
  }

  const totalPages = reportMeta?.last_page ?? 1;
  const displayRows = useMemo(() => rows, [rows]);
  const hasCharts = Boolean(definition.charts?.length);
  const showCharts = hasCharts && (viewMode === "charts" || viewMode === "both");
  const showTable = viewMode === "table" || viewMode === "both" || !hasCharts;
  const reportRefresh = useReportRefreshUi({ loading, hasRows: rows.length > 0 });

  const kpis = useMemo(() => {
    if (!definition.kpis) return [];
    return definition.kpis.map((kpi) => {
      const result = kpi.compute(rows, reportSummary);
      return {
        id: kpi.id,
        label: kpi.label,
        value: result.value ?? "—",
        hint: result.hint,
      };
    });
  }, [rows, reportSummary, definition.kpis]);

  const columns = useMemo(() => {
    const base = filterStructuredReportColumns(definition.columns ?? [], { multiBranch });
    if (definition.key !== "kra-unfiscalized-sales") return base;

    return base.map((col) => {
      if (col.key !== "last_kra_error") return col;
      return {
        ...col,
        wrap: true,
        cell: (row) => {
          const full = String(row.last_kra_error ?? "").trim();
          if (!full) return "—";
          const snippet = snippetKraErrorReason(full, 4);
          return (
            <div className="flex flex-col items-start gap-1 text-left">
              <span className="text-sm leading-snug text-slate-800" title={full}>
                {snippet}
              </span>
              <button
                type="button"
                onClick={() =>
                  setFailureReasonRow({
                    ...row,
                    error_message: full,
                    kra_response_id: row.last_kra_response_id,
                    id: row.last_kra_response_id,
                  })
                }
                className="font-medium text-red-700 hover:underline"
              >
                View full reason
              </button>
            </div>
          );
        },
      };
    });
  }, [definition.columns, definition.key, multiBranch]);

  const footerTotals = useMemo(() => {
    if (!definition.footerTotals || !columns.length) return {};
    const totals = {};
    for (const col of columns) {
      if (!col.total) continue;
      let sumValue;
      // Custom footer logic (e.g. dedupe LPO headers) wins over raw SUM summary.
      if (col.footerCompute) {
        sumValue = col.footerCompute(rows);
      } else if (reportSummary && reportSummary[col.key] != null && reportSummary[col.key] !== "") {
        sumValue = Number(reportSummary[col.key]) || 0;
      } else if (col.key === "net_ex_vat" && reportSummary?.net_ex_vat != null) {
        sumValue = Number(reportSummary.net_ex_vat) || 0;
      } else if (col.sumFromRow) {
        sumValue = rows.reduce((acc, row) => acc + (Number(col.sumFromRow(row)) || 0), 0);
      } else {
        sumValue = rows.reduce((acc, row) => acc + (Number(row[col.key]) || 0), 0);
      }
      totals[col.key] =
        isInventoryQtyField(col.key) || isLpoPackQtyField(col.key)
          ? "—"
          : formatReportCell(col.key, sumValue);
    }
    return totals;
  }, [rows, columns, definition.footerTotals, reportSummary]);

  function applyFilters() {
    setPage(1);
    setApplied({ fromDate, toDate, branchId, extraFilters, queryFilters });
  }

  function resetFilters() {
    const range = resolveDefaultRange();
    const nextBranchId = defaultReportBranchId(user, isOrgWide);
    const nextExtraFilters = defaultReportExtraFilterValues(definition.key, definition.extraFilters);
    setFromDate(range.from);
    setToDate(range.to);
    setBranchId(nextBranchId);
    setExtraFilters(nextExtraFilters);
    setQueryFilters({});
    setApplied({
      fromDate: range.from,
      toDate: range.to,
      branchId: nextBranchId,
      extraFilters: nextExtraFilters,
      queryFilters: {},
    });
    setPage(1);
  }

  function handleExtraFilterChange(id, value) {
    setExtraFilters((current) => ({ ...current, [id]: value }));
  }

  function branchLabel(branchIdValue) {
    if (!branchIdValue) return "All branches";
    return branches.find((b) => String(b.id) === String(branchIdValue))?.branch_name ?? "";
  }

  const exportSearchParams = useMemo(
    () =>
      buildReportQueryParams(definition.key, {
        fromDate: applied.fromDate,
        toDate: applied.toDate,
        branchId: applied.branchId,
        extraValues: applied.queryFilters,
      }),
    [applied, definition.key],
  );

  const fetchAllReportRows = useCallback(async () => {
    const centrixRows = await loadFullReportDataset(definition.apiPath, exportSearchParams, {
      message: `Loading ${definition.title}…`,
    });

    let combined = [...centrixRows];
    if (definition.filterRows) {
      combined = definition.filterRows(combined, applied.extraFilters);
    }
    if (definition.key === "stock-movement") {
      combined = filterStockMovementRows(combined, capabilities);
    }
    return combined;
  }, [applied.extraFilters, capabilities, definition, exportSearchParams]);

  // Charts: use the already-loaded table page (no auto full-dataset crawl).
  // Full export still goes through the queued path via fetchAllReportRows.
  useEffect(() => {
    if (!showCharts) return undefined;
    const cacheKey = JSON.stringify({
      path: definition.apiPath,
      params: exportSearchParams,
      extras: applied.extraFilters,
      key: definition.key,
      page,
      pageSize,
    });
    if (cacheKey === chartCacheKeyRef.current && chartRows.length > 0) {
      return undefined;
    }

    chartCacheKeyRef.current = cacheKey;
    const source = Array.isArray(rows) ? rows : [];
    const total = Number(reportMeta?.total ?? source.length);
    if (source.length > MAX_CHART_ROWS) {
      setChartRows(source.slice(0, MAX_CHART_ROWS));
      setChartTruncated(true);
    } else {
      setChartRows(source);
      setChartTruncated(total > source.length);
    }
    setChartLoading(false);
    return undefined;
  }, [
    showCharts,
    rows,
    reportMeta?.total,
    page,
    pageSize,
    definition.apiPath,
    definition.key,
    exportSearchParams,
    applied.extraFilters,
    chartRows.length,
  ]);

  // Reset to table when switching reports.
  useEffect(() => {
    setViewMode("table");
    setChartRows([]);
    setChartTruncated(false);
    chartCacheKeyRef.current = "";
  }, [definition.key]);

  return (
    <>
      <ReportPageShell
      section={definition.section}
      title={definition.title}
      subtitle={definition.subtitle}
      onAnalyzeWithAi={() => setAiOpen(true)}
      exportConfig={
        columns.length
          ? {
              filename: definition.key ?? "report",
              columns: columns.map((col) => ({
                ...col,
                accessor: (row) => formatReportCell(col.key, col.accessor(row), undefined, row),
              })),
              ...(definition.filterRows
                ? { getRows: fetchAllReportRows }
                : {
                    exportSource: {
                      path: definition.apiPath,
                      searchParams: exportSearchParams,
                      estimatedRowCount: reportMeta?.total ?? rows.length,
                    },
                  }),
              estimatedRowCount: reportMeta?.total ?? rows.length,
              meta: {
                fromDate: applied.fromDate,
                toDate: applied.toDate,
                branchName: branchLabel(applied.branchId),
              },
              footerRow: Object.keys(footerTotals).length ? footerTotals : null,
              disabled: loading,
            }
          : undefined
      }
    >
      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : null}

      <ReportFilterBar
        fromDate={fromDate}
        toDate={toDate}
        branchId={branchId}
        branches={branches}
        reportKey={definition.key}
        queryFilterValues={queryFilters}
        queryFilterOptions={filterOptions}
        onQueryFilterChange={(id, value) => setQueryFilters((f) => ({ ...f, [id]: value }))}
        showDateRange={reportShowsDateRange(definition.key) && definition.showDateRange !== false}
        extraFilters={definition.extraFilters ?? []}
        extraValues={extraFilters}
        onFromDateChange={setFromDate}
        onToDateChange={setToDate}
        onBranchChange={setBranchId}
        onExtraChange={handleExtraFilterChange}
        onFilter={applyFilters}
        onRefresh={refreshReport}
        onReset={resetFilters}
        loading={loading}
        showBranchFilter={multiBranch && !reportHidesBranchFilter(definition.key)}
      />

      {reportRefresh.showInitialLoading ? (
        <p className="theme-subtext py-8 text-center text-sm">Loading report…</p>
      ) : null}

      {!reportRefresh.showInitialLoading ? (
        <div className={reportRefresh.contentClassName}>
          <ReportKpiGrid items={kpis} />

          {hasCharts ? (
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
                  Switch views to compare the same filtered results as charts or a table.
                </p>
              </div>
              <ReportViewModeToggle value={viewMode} onChange={setViewMode} disabled={loading} />
            </div>
          ) : null}

          {showCharts ? (
            <>
              {chartTruncated ? (
                <p className="mb-2 text-xs text-amber-800">
                  Charts use the current table page for speed. Export still includes the full
                  filtered dataset (queued when large).
                </p>
              ) : null}
              <ReportChartsSection
                charts={definition.charts}
                rows={chartRows.length ? chartRows : rows}
                loading={chartLoading && chartRows.length === 0}
              />
            </>
          ) : null}

          {showTable ? (
            <>
              <ReportTable
                columns={columns}
                rows={displayRows}
                footerTotals={footerTotals}
                groupBy={definition.groupBy ?? null}
              />
              <PaginationBar
                page={page}
                totalPages={totalPages}
                total={reportMeta?.total ?? rows.length}
                pageSize={pageSize}
                onChange={setPage}
                onPageSizeChange={handlePageSizeChange}
                pageSizeOptions={[10, 20, 25, 50, 100]}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </ReportPageShell>
      <AiInsightPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        title={`Analyze: ${definition.title}`}
        mode="report"
        reportKey={definition.key}
        filters={{
          from: applied.fromDate,
          to: applied.toDate,
          branch_id: applied.branchId || undefined,
          ...applied.queryFilters,
          ...applied.extraFilters,
        }}
        rows={rows}
        summary={reportSummary}
      />
      <KraFailureReasonDialog
        open={Boolean(failureReasonRow)}
        row={failureReasonRow}
        onClose={() => setFailureReasonRow(null)}
      />
    </>
  );
}
