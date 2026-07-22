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
import { formatReportCell } from "@/lib/reports/format";
import { isInventoryQtyField, isLpoPackQtyField } from "@/lib/inventory-qty-display";
import { loadFullReportDataset } from "@/lib/paginated-fetch";
import {
  ReportFilterBar,
  ReportKpiGrid,
  ReportPageShell,
  ReportTable,
} from "@/components/reports/report-screen-shared";
import { normalizeReportMeta, normalizeReportRows, normalizeReportSummary } from "@/lib/reports/api-response";
import { defaultReportBranchId, defaultReportDateRange } from "@/lib/reports/report-filters";
import { buildReportQueryParams, reportHidesBranchFilter, reportShowsDateRange } from "@/lib/reports/report-filter-config";
import { useReportFilterOptions } from "@/lib/reports/use-report-filter-options";
import { ProfitLossReportScreen } from "@/components/reports/profit-loss-report-screen";
import { ExpensesReportScreen } from "@/components/reports/expenses-report-screen";
import { DonutChart, ReportBarChart, CHART_COLORS } from "@/components/reports/report-charts";
import { filterStructuredReportColumns } from "@/lib/reports/report-column-visibility";
import { filterStockMovementRows } from "@/lib/reports/report-row-filters";
import { clearTabPaneCache, readTabPaneCache, writeTabPaneCache } from "@/lib/tab-pane-session-cache";

const PAGE_SIZE = 20;
const CACHE_SLOT = "structured-report";

export function StructuredReportScreen({ definition }) {
  if (definition.variant === "profit-loss") {
    return <ProfitLossReportScreen definition={definition} />;
  }
  if (definition.variant === "expenses") {
    return <ExpensesReportScreen definition={definition} />;
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
  const defaultRange = useMemo(() => {
    if (definition.emptyDateRange) {
      return { from: "", to: "" };
    }
    return defaultReportDateRange(definition.defaultDateRangeDays ?? 29);
  }, [definition.defaultDateRangeDays, definition.emptyDateRange]);
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
  const [extraFilters, setExtraFilters] = useState(() =>
    cacheMatchesDefinition ? cachedBundle.extraFilters ?? {} : {},
  );
  const [queryFilters, setQueryFilters] = useState(() =>
    cacheMatchesDefinition ? cachedBundle.queryFilters ?? {} : {},
  );
  const [applied, setApplied] = useState(() =>
    cacheMatchesDefinition && cachedBundle.applied
      ? cachedBundle.applied
      : {
          fromDate: defaultRange.from,
          toDate: defaultRange.to,
          branchId: cacheMatchesDefinition ? cachedBundle.branchId ?? "" : "",
          extraFilters: {},
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

  const depsKey = `${definition.key}|${definition.apiPath}|${page}|${appliedKey}`;

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
        per_page: PAGE_SIZE,
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
      const meta = normalizeReportMeta(res, page, PAGE_SIZE);
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
  }, [definition.key, definition.apiPath, definition.dateColumn, page, paneHref, depsKey]);

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
  const chartRows = useMemo(() => rows, [rows]);

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

  const columns = useMemo(
    () => filterStructuredReportColumns(definition.columns ?? [], { multiBranch }),
    [definition.columns, multiBranch],
  );

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
    const range = defaultReportDateRange(definition.defaultDateRangeDays ?? 29);
    const nextBranchId = defaultReportBranchId(user, isOrgWide);
    setFromDate(range.from);
    setToDate(range.to);
    setBranchId(nextBranchId);
    setExtraFilters({});
    setQueryFilters({});
    setApplied({
      fromDate: range.from,
      toDate: range.to,
      branchId: nextBranchId,
      extraFilters: {},
      queryFilters: {},
    });
    setPage(1);
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

  return (
    <>
      <ReportPageShell
      section={definition.section}
      title={definition.title}
      subtitle={definition.subtitle}
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
        onExtraChange={(id, value) => setExtraFilters((f) => ({ ...f, [id]: value }))}
        onFilter={applyFilters}
        onRefresh={refreshReport}
        onReset={resetFilters}
        loading={loading}
        showBranchFilter={multiBranch && !reportHidesBranchFilter(definition.key)}
      />

      {!loading ? <ReportKpiGrid items={kpis} /> : null}

      {!loading && definition.charts?.length ? (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {definition.charts.map((chart) => {
            if (chart.type === "bar") {
              return (
                <ReportBarChart
                  key={chart.title ?? chart.valueKey}
                  rows={chartRows}
                  labelKey={chart.labelKey}
                  valueKey={chart.valueKey}
                  title={chart.title}
                />
              );
            }
            if (chart.type === "donut") {
              const grouped = aggregateChartRows(chartRows, chart.labelKey, chart.valueKey);
              const total = grouped.reduce((s, g) => s + g.value, 0);
              const segments = grouped.slice(0, chart.limit ?? 5).map((g, i) => ({
                label: g.label,
                value: g.value,
                sharePct: total > 0 ? Math.round((g.value / total) * 1000) / 10 : 0,
                color: CHART_COLORS[i % CHART_COLORS.length],
              }));
              return (
                <div key={chart.title ?? chart.valueKey} className="theme-panel rounded-xl border p-4 shadow-sm">
                  {chart.title ? <h3 className="mb-3 text-sm font-medium text-slate-900">{chart.title}</h3> : null}
                  <DonutChart segments={segments} />
                </div>
              );
            }
            return null;
          })}
        </div>
      ) : null}

      {loading ? null : (
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
            pageSize={PAGE_SIZE}
            onChange={setPage}
          />
        </>
      )}
    </ReportPageShell>
    </>
  );
}

function aggregateChartRows(rows, labelKey, valueKey) {
  const map = new Map();
  for (const row of rows) {
    const label = String(row[labelKey] ?? "—");
    const val = Number(row[valueKey]) || 0;
    map.set(label, (map.get(label) ?? 0) + val);
  }
  return [...map.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}
