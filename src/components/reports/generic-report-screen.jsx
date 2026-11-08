"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
import {
  filterReportColumnKeys,
  reportColumnLabel,
  reportConstantHeaderLines,
} from "@/lib/reports/report-column-visibility";
import { ReportExportToolbar } from "@/components/reports/report-export-toolbar";
import { normalizeReportMeta, normalizeReportRows, normalizeReportSummary } from "@/lib/reports/api-response";
import { defaultReportBranchId, defaultReportDateRange } from "@/lib/reports/report-filters";
import { REPORT_EXTRA_FILTERS } from "@/lib/reports/report-filter-config";
import {
  buildReportQueryParams,
  reportDefaultDateRangeDays,
  reportShowsDateRange,
  reportShowsTableFooter,
} from "@/lib/reports/report-filter-config";
import { useReportFilterOptions } from "@/lib/reports/use-report-filter-options";
import { ReportQueryFilterFields } from "@/components/reports/report-query-filter-fields";
import { ReportBranchSearchSelect } from "@/components/reports/report-filter-search-select";
import { reportVatKpis } from "@/lib/reports/vat-summary";
import { formatReportCell, formatReportKes } from "@/lib/reports/format";
import { isInventoryQtyField, isLpoPackQtyField } from "@/lib/inventory-qty-display";
import { ReportKpiGrid } from "@/components/reports/report-screen-shared";
import { ReportCellLink } from "@/components/reports/report-cell-link";
import { AiInsightPanel } from "@/components/ai/ai-insight-panel";
import {
  CatalogPageShell,
  Field,
  FILTER_CONTROL_CLASS,
  FilterToolbar,
  PaginationBar,
  PrimaryButton,
} from "@/components/catalog/catalog-shared";
import { resolveListPageSize, useListPageSize } from "@/lib/use-list-page-controls";
import { clearTabPaneCache, readTabPaneCache, writeTabPaneCache } from "@/lib/tab-pane-session-cache";
import {
  REPORT_DEFAULT_PAGE_SIZE,
  REPORT_LIST_PAGE_SIZE_OPTIONS,
  reportCacheMatchesPageSize,
} from "@/lib/reports/report-page-size";

const CACHE_SLOT = "generic-report";

function formatCell(key, value, row) {
  return formatReportCell(key, value, undefined, row);
}

function labelizeKey(key) {
  return reportColumnLabel(key);
}

export function GenericReportScreen({ reportKey, label, apiPath, subtitle }) {
  const urlParams = useSearchParams();
  const payrollRunId = urlParams.get("payroll_run_id") ?? "";
  const { user, isOrgWide, capabilities } = useAuth();
  const { paneHref } = useTabPaneActive();
  const multiBranch = isMultiBranchCatalog(capabilities);
  const defaultRange = useMemo(
    () => defaultReportDateRange(reportDefaultDateRangeDays(reportKey, capabilities?.module_settings)),
    [reportKey, capabilities?.module_settings],
  );
  const defaultBranch = useMemo(() => defaultReportBranchId(user, isOrgWide), [user, isOrgWide]);
  const branchInitialized = useRef(false);
  const filterOptions = useReportFilterOptions(reportKey);
  const cachedBundle = paneHref ? readTabPaneCache(paneHref, CACHE_SLOT) : null;
  const initialPageSize = resolveListPageSize(
    REPORT_DEFAULT_PAGE_SIZE,
    REPORT_LIST_PAGE_SIZE_OPTIONS,
  ).pageSize;
  const cacheMatches =
    cachedBundle &&
    cachedBundle.reportKey === reportKey &&
    cachedBundle.apiPath === apiPath &&
    reportCacheMatchesPageSize(cachedBundle, initialPageSize);

  const [rows, setRows] = useState(() => (cacheMatches ? cachedBundle.rows ?? [] : []));
  const [meta, setMeta] = useState(() => (cacheMatches ? cachedBundle.meta ?? null : null));
  const [reportSummary, setReportSummary] = useState(() =>
    cacheMatches ? cachedBundle.reportSummary ?? null : null,
  );
  const [loading, setLoading] = useState(
    () => !(cacheMatches && (cachedBundle.rows?.length || cachedBundle.meta)),
  );
  const [error, setError] = useState(null);
  const [page, setPage] = useState(() => (cacheMatches ? cachedBundle.page ?? 1 : 1));
  const { pageSize, setPageSize, pageSizeOptions, pageSizeReady } = useListPageSize(
    REPORT_DEFAULT_PAGE_SIZE,
    REPORT_LIST_PAGE_SIZE_OPTIONS,
  );
  const [fromDate, setFromDate] = useState(() =>
    cacheMatches ? cachedBundle.fromDate ?? defaultRange.from : defaultRange.from,
  );
  const [toDate, setToDate] = useState(() =>
    cacheMatches ? cachedBundle.toDate ?? defaultRange.to : defaultRange.to,
  );
  const [branchId, setBranchId] = useState(() =>
    cacheMatches ? cachedBundle.branchId ?? defaultBranch : defaultBranch,
  );
  const [queryFilters, setQueryFilters] = useState(() =>
    cacheMatches ? cachedBundle.queryFilters ?? {} : {},
  );
  const [applied, setApplied] = useState(() =>
    cacheMatches && cachedBundle.applied
      ? cachedBundle.applied
      : {
          fromDate: cacheMatches ? cachedBundle.fromDate ?? defaultRange.from : defaultRange.from,
          toDate: cacheMatches ? cachedBundle.toDate ?? defaultRange.to : defaultRange.to,
          branchId: cacheMatches ? cachedBundle.branchId ?? defaultBranch : defaultBranch,
          queryFilters: cacheMatches ? cachedBundle.queryFilters ?? {} : {},
        },
  );
  const [branches, setBranches] = useState([]);
  const [aiOpen, setAiOpen] = useState(false);

  const showDateFilters = reportShowsDateRange(reportKey);
  const hasQueryFilters = (REPORT_EXTRA_FILTERS[reportKey]?.length ?? 0) > 0;
  const showFilterToolbar = showDateFilters || multiBranch || hasQueryFilters;

  useEffect(() => {
    fetchBranchesCached()
      .then((rows) => setBranches(rows ?? []))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (!user || branchInitialized.current) return;
    branchInitialized.current = true;
    if (cacheMatches && (cachedBundle?.applied?.branchId != null || cachedBundle?.branchId != null)) {
      return;
    }
    const nextBranch = defaultReportBranchId(user, isOrgWide);
    setBranchId((prev) => (prev === nextBranch ? prev : nextBranch));
    setApplied((prev) => (prev.branchId === nextBranch ? prev : { ...prev, branchId: nextBranch }));
  }, [user, isOrgWide, cacheMatches, cachedBundle?.applied?.branchId, cachedBundle?.branchId]);

  const appliedKey = useMemo(() => JSON.stringify(applied), [applied]);
  const depsKey = pageSizeReady
    ? `${reportKey}|${apiPath}|${page}|${pageSize}|${appliedKey}|${payrollRunId}`
    : `${reportKey}|${apiPath}|page-size-pending`;

  const loadReport = useCallback(async () => {
    if (!pageSizeReady) return;
    setLoading(true);
    setError(null);
    try {
      const searchParams = {
        per_page: pageSize,
        page,
        ...buildReportQueryParams(reportKey, {
          fromDate: applied.fromDate,
          toDate: applied.toDate,
          branchId: applied.branchId,
          extraValues: applied.queryFilters,
        }),
      };
      if (payrollRunId) searchParams.payroll_run_id = payrollRunId;

      const res = await apiRequest(apiPath, { searchParams, loading: false });
      const centrixRows = normalizeReportRows(res);
      const nextMeta = normalizeReportMeta(res, page, pageSize);
      const nextSummary = normalizeReportSummary(res);
      setRows(centrixRows);
      setMeta(nextMeta);
      setReportSummary(nextSummary);
      writeTabPaneCache(paneHref, CACHE_SLOT, {
        reportKey,
        apiPath,
        rows: centrixRows,
        meta: nextMeta,
        reportSummary: nextSummary,
        page,
        pageSize,
        fromDate: applied.fromDate,
        toDate: applied.toDate,
        branchId: applied.branchId,
        queryFilters: applied.queryFilters,
        applied,
      });
      markTabAwareDataLoaded(paneHref, depsKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setRows([]);
      setMeta(null);
      setReportSummary(null);
    } finally {
      setLoading(false);
    }
  }, [apiPath, page, pageSize, pageSizeReady, applied, payrollRunId, reportKey, paneHref, depsKey]);

  function handlePageSizeChange(next) {
    setPageSize(next);
    setPage(1);
  }

  function applyFilters() {
    setPage(1);
    setApplied({
      fromDate,
      toDate,
      branchId,
      queryFilters: { ...queryFilters },
    });
  }

  const hasData = pageSizeReady && (rows.length > 0 || meta != null);
  useTabAwareDataLoad(loadReport, { depsKey, hasData });

  function refreshReport() {
    invalidateTabAwareDataLoad(paneHref);
    clearTabPaneCache(paneHref, CACHE_SLOT);
    void loadReport();
  }

  const columns = useMemo(() => {
    if (!rows[0]) return [];
    return filterReportColumnKeys(Object.keys(rows[0]), { multiBranch, reportKey, rows });
  }, [rows, multiBranch, reportKey]);

  const recordHeaderLines = useMemo(
    () => reportConstantHeaderLines(reportKey, rows),
    [reportKey, rows],
  );

  const footerTotals = useMemo(() => {
    if (!reportShowsTableFooter(reportKey) || (!rows.length && !reportSummary) || !columns.length) return {};
    const totals = {};
    for (const col of columns) {
      if (
        !/amount|total|paid|balance|vat|gross|net|qty|quantity|count|orders|revenue|collected|discount|credit|debit|sales|profit|expense|due|outstanding|variance|float|value|line_items/i.test(
          col,
        )
      ) {
        continue;
      }
      if (isInventoryQtyField(col) || isLpoPackQtyField(col)) {
        totals[col] = "—";
        continue;
      }
      const sum =
        reportSummary && reportSummary[col] != null && reportSummary[col] !== ""
          ? Number(reportSummary[col]) || 0
          : rows.reduce((acc, row) => acc + (Number(row[col]) || 0), 0);
      totals[col] = formatCell(col, sum);
    }
    return totals;
  }, [rows, columns, reportKey, reportSummary]);

  const branchLabel = branches.find((b) => String(b.id) === branchId)?.branch_name
    ?? (branchId ? "" : "All branches");

  const exportColumns = useMemo(() => {
    const sample = rows[0];
    if (!sample) return [];
    return filterReportColumnKeys(Object.keys(sample), { multiBranch, reportKey, rows }).map((key) => ({
      key,
      label: key === "notes" && reportKey === "stock-transfers" ? "Reason" : labelizeKey(key),
      accessor: (row) => formatCell(key, row[key], row),
      ...(key === "notes" && reportKey === "stock-transfers" ? { printAsRow: true } : {}),
    }));
  }, [rows, multiBranch, reportKey]);

  const exportSearchParams = useMemo(() => {
    const searchParams = buildReportQueryParams(reportKey, {
      fromDate: applied.fromDate,
      toDate: applied.toDate,
      branchId: applied.branchId,
      extraValues: applied.queryFilters,
    });
    if (payrollRunId) searchParams.payroll_run_id = payrollRunId;
    return searchParams;
  }, [applied, payrollRunId, reportKey]);

  const totalPages = meta?.last_page ?? 1;
  const total = meta?.total ?? rows.length;

  const vatKpis = useMemo(
    () => reportVatKpis(rows, (value) => formatReportKes(value), reportSummary),
    [rows, reportSummary],
  );

  const aiFilters = useMemo(
    () => ({
      from: applied.fromDate,
      to: applied.toDate,
      branch_id: applied.branchId || undefined,
      ...applied.queryFilters,
      ...(payrollRunId ? { payroll_run_id: payrollRunId } : {}),
    }),
    [applied, payrollRunId],
  );

  return (
    <>
      <CatalogPageShell
      title={label ?? "Report"}
      subtitle={subtitle ?? undefined}
      action={
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {exportColumns.length ? (
            <ReportExportToolbar
              filename={reportKey ?? label ?? "report"}
              title={label ?? "Report"}
              subtitle={subtitle ?? ""}
              columns={exportColumns}
              exportSource={{
                path: apiPath,
                searchParams: exportSearchParams,
                estimatedRowCount: total,
              }}
              estimatedRowCount={total}
              meta={{
                fromDate,
                toDate,
                branchName: branchLabel,
                extraLines: recordHeaderLines,
              }}
              disabled={loading}
              onAnalyzeWithAi={() => setAiOpen(true)}
            />
          ) : null}
          <PrimaryButton type="button" showIcon={false} onClick={() => void refreshReport()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </PrimaryButton>
        </div>
      }
      toolbar={
        showFilterToolbar ? (
        <FilterToolbar>
          <Link href="/reports" className="pb-2 text-sm text-[#185FA5] hover:underline">
            ← All reports
          </Link>
          {showDateFilters ? (
            <>
              <Field label="From">
                <input
                  type="date"
                  className={FILTER_CONTROL_CLASS}
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  className={FILTER_CONTROL_CLASS}
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </Field>
            </>
          ) : null}
          {multiBranch ? (
            <Field label="Branch">
              <ReportBranchSearchSelect
                value={branchId}
                onChange={setBranchId}
                branches={branches}
                controlClassName={FILTER_CONTROL_CLASS}
              />
            </Field>
          ) : null}
          <ReportQueryFilterFields
            reportKey={reportKey}
            values={queryFilters}
            onChange={(id, value) => {
              setQueryFilters((prev) => ({ ...prev, [id]: value }));
            }}
            optionsByKey={filterOptions}
          />
          <div className="flex items-end pb-0.5">
            <PrimaryButton type="button" showIcon={false} onClick={applyFilters} disabled={loading}>
              Apply
            </PrimaryButton>
          </div>
        </FilterToolbar>
        ) : (
          <div className="mb-4">
            <Link href="/reports" className="text-sm text-[#185FA5] hover:underline">
              ← All reports
            </Link>
          </div>
        )
      }
      banner={
        error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null
      }
    >
      {vatKpis.length ? (
        <ReportKpiGrid items={vatKpis.map((item) => ({ ...item, hint: `${item.hint ?? ""} (current page)`.trim() }))} />
      ) : null}
      {recordHeaderLines.length ? (
        <div className="mb-3 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-4 py-3 text-sm text-slate-700">
          {recordHeaderLines.map((line) => (
            <p key={line} className="leading-6">
              {line}
            </p>
          ))}
        </div>
      ) : null}
      <div className={`theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm ${loading && rows.length > 0 ? "opacity-60 transition-opacity duration-150" : ""}`.trim()}>
        {!loading && rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No rows for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs font-medium">
                  {columns.map((col) => (
                    <th key={col} className="whitespace-nowrap px-4 py-2.5">
                      {labelizeKey(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={row.id ?? idx} className="border-b border-slate-100 last:border-b-0">
                    {columns.map((col) => (
                      <td key={col} className="whitespace-nowrap px-4 py-2.5 text-slate-800">
                        <ReportCellLink columnKey={col} row={row} value={row[col]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              {Object.keys(footerTotals).length ? (
                <tfoot>
                  <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-900">
                    {columns.map((col, idx) => (
                      <td key={col} className="whitespace-nowrap px-4 py-2.5">
                        {idx === 0 ? "Totals" : footerTotals[col] ?? ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={handlePageSizeChange}
          pageSizeOptions={pageSizeOptions}
        />
      </div>
    </CatalogPageShell>
      <AiInsightPanel
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        title={`Analyze: ${label ?? reportKey ?? "Report"}`}
        mode="report"
        reportKey={reportKey}
        filters={aiFilters}
        rows={rows}
        summary={reportSummary}
      />
    </>
  );
}
