"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { filterReportColumnKeys, reportColumnLabel } from "@/lib/reports/report-column-visibility";
import { normalizeReportRows } from "@/lib/reports/api-response";
import { parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useReportRefreshUi } from "@/lib/list-refresh-ui";
import { CatalogPageShell, Field, PaginationBar, PrimaryButton, SearchInput, formatShortDate, inputClassName, SearchableSelect } from "@/components/catalog/catalog-shared";
import { accountOptionLabel, formatAccountingAmount, defaultAccountingDateRange } from "@/lib/accounting-shared";
import { defaultReportDateRange } from "@/lib/reports/report-filters";
import { getReportsDefaultDateRange } from "@/lib/sales-settings";
import { ReportExportToolbar } from "@/components/reports/report-export-toolbar";
import { resolveListPageSize, useListPageSize } from "@/lib/use-list-page-controls";
import { clearTabPaneCache, readTabPaneCache, writeTabPaneCache } from "@/lib/tab-pane-session-cache";
import {
  REPORT_DEFAULT_PAGE_SIZE,
  REPORT_LIST_PAGE_SIZE_OPTIONS,
  reportCacheMatchesPageSize,
} from "@/lib/reports/report-page-size";

const CACHE_SLOT = "accounting-report";

function formatCell(key, value) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    if (/amount|total|paid|balance|debit|credit|cash|net|due|outstanding|revenue|expense|income|equity|assets|liabilities/i.test(key)) {
      return formatAccountingAmount(value);
    }
    return String(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatShortDate(value);
  }
  return String(value);
}

function labelizeKey(key) {
  return reportColumnLabel(key);
}

const SUMMARY_LABELS = {
  total_debit: "Total debit",
  total_credit: "Total credit",
  total_assets: "Total assets",
  total_liabilities: "Total liabilities",
  total_equity: "Total equity",
  liabilities_and_equity: "Liabilities + equity",
  total_revenue: "Total revenue",
  total_expenses: "Total expenses",
  net_income: "Net income",
  cash_in: "Cash in",
  cash_out: "Cash out",
  net_change: "Net change",
  net_operating: "Net operating cash",
  net_investing: "Net investing cash",
  net_financing: "Net financing cash",
  net_change_in_cash: "Net change in cash",
  beginning_cash: "Beginning cash",
  ending_cash: "Ending cash",
};

export function AccountingReportScreen({
  title,
  subtitle,
  apiPath,
  showAccountFilter = false,
  enableSearch = false,
  backHref = "/accounting",
  emptyLabel = "No rows for this filter.",
  intro = null,
  /** Offset days for `defaultReportDateRange`, or omit for calendar-month (TB/BS/P&L). */
  defaultDateRangeDays = null,
  /** When true, use org/platform `sales.reports_default_date_range_days` (daily vs monthly). */
  useReportsDefaultRange = false,
}) {
  const { user, capabilities, isOrgWide } = useAuth();
  const { paneHref } = useTabPaneActive();
  const multiBranch = isMultiBranchCatalog(capabilities);
  const monthRange = useMemo(() => {
    if (useReportsDefaultRange) {
      return getReportsDefaultDateRange(capabilities?.module_settings);
    }
    if (defaultDateRangeDays != null) {
      return defaultReportDateRange(defaultDateRangeDays);
    }
    return defaultAccountingDateRange();
  }, [useReportsDefaultRange, defaultDateRangeDays, capabilities?.module_settings]);
  const cachedBundle = paneHref ? readTabPaneCache(paneHref, CACHE_SLOT) : null;
  const initialPageSize = resolveListPageSize(
    REPORT_DEFAULT_PAGE_SIZE,
    REPORT_LIST_PAGE_SIZE_OPTIONS,
  ).pageSize;
  const cacheMatches =
    cachedBundle &&
    cachedBundle.apiPath === apiPath &&
    reportCacheMatchesPageSize(cachedBundle, initialPageSize);

  const [rows, setRows] = useState(() => (cacheMatches ? cachedBundle.rows ?? [] : []));
  const [summary, setSummary] = useState(() => (cacheMatches ? cachedBundle.summary ?? null : null));
  const [meta, setMeta] = useState(() => (cacheMatches ? cachedBundle.meta ?? null : null));
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(
    () => !(cacheMatches && (cachedBundle.rows?.length || cachedBundle.meta || cachedBundle.summary)),
  );
  const [error, setError] = useState(null);
  const [page, setPage] = useState(() => (cacheMatches ? cachedBundle.page ?? 1 : 1));
  const { pageSize, setPageSize, pageSizeOptions, pageSizeReady } = useListPageSize(
    REPORT_DEFAULT_PAGE_SIZE,
    REPORT_LIST_PAGE_SIZE_OPTIONS,
  );
  const [fromDate, setFromDate] = useState(() =>
    cacheMatches ? cachedBundle.fromDate ?? monthRange.from : monthRange.from,
  );
  const [toDate, setToDate] = useState(() =>
    cacheMatches ? cachedBundle.toDate ?? monthRange.to : monthRange.to,
  );
  const [branchId, setBranchId] = useState(() =>
    cacheMatches ? cachedBundle.branchId ?? "" : "",
  );
  const [accountId, setAccountId] = useState(() =>
    cacheMatches ? cachedBundle.accountId ?? "" : "",
  );
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [applied, setApplied] = useState(() =>
    cacheMatches && cachedBundle.applied
      ? cachedBundle.applied
      : {
          fromDate: cacheMatches ? cachedBundle.fromDate ?? monthRange.from : monthRange.from,
          toDate: cacheMatches ? cachedBundle.toDate ?? monthRange.to : monthRange.to,
          branchId: cacheMatches ? cachedBundle.branchId ?? "" : "",
          accountId: cacheMatches ? cachedBundle.accountId ?? "" : "",
          search: "",
        },
  );
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    const branchPromise = fetchBranchesCached().catch(() => []);
    const accountsPromise = showAccountFilter
      ? apiRequest("/chart-of-accounts", { searchParams: { per_page: 200 }, loading: false })
          .then((res) => res.data ?? [])
          .catch(() => [])
      : Promise.resolve([]);
    Promise.all([branchPromise, accountsPromise]).then(([branchList, accountList]) => {
      setBranches(branchList ?? []);
      setAccounts(accountList ?? []);
    });
  }, [showAccountFilter]);

  useEffect(() => {
    // Only scope to home branch for branch-limited users; org-wide / single-branch
    // catalogs default to all posted activity (no silent branch filter).
    if (!multiBranch || isOrgWide?.() || branchId || !user?.branch_id) return;
    const next = String(user.branch_id);
    setBranchId(next);
    setApplied((prev) => (prev.branchId === next ? prev : { ...prev, branchId: next }));
  }, [user?.branch_id, branchId, multiBranch, isOrgWide]);

  const appliedKey = useMemo(() => JSON.stringify(applied), [applied]);
  const depsKey = pageSizeReady
    ? `${apiPath}|${page}|${pageSize}|${appliedKey}`
    : `${apiPath}|page-size-pending`;

  const loadReport = useCallback(async () => {
    if (!pageSizeReady) return;
    setLoading(true);
    setError(null);
    try {
      const searchParams = { per_page: pageSize, page };
      if (applied.fromDate) searchParams.from_date = applied.fromDate;
      if (applied.toDate) searchParams.to_date = applied.toDate;
      if (applied.branchId) searchParams.branch_id = applied.branchId;
      if (applied.accountId) searchParams.account_id = applied.accountId;
      if (enableSearch && String(applied.search ?? "").trim()) {
        searchParams.q = String(applied.search).trim();
      }

      const res = await apiRequest(apiPath, { searchParams, loading: false });
      let nextRows;
      let nextMeta;
      if (res?.current_page != null || res?.last_page != null || res?.total != null) {
        const parsed = parsePaginator(res);
        nextRows = parsed.items;
        nextMeta = {
          last_page: parsed.totalPages,
          total: parsed.total,
          current_page: parsed.page,
          per_page: parsed.perPage,
        };
      } else {
        nextRows = normalizeReportRows(res);
        nextMeta = res.meta ?? null;
      }
      const nextSummary = res.summary ?? null;
      setRows(nextRows);
      setMeta(nextMeta);
      setSummary(nextSummary);
      writeTabPaneCache(paneHref, CACHE_SLOT, {
        apiPath,
        rows: nextRows,
        meta: nextMeta,
        summary: nextSummary,
        page,
        pageSize,
        fromDate: applied.fromDate,
        toDate: applied.toDate,
        branchId: applied.branchId,
        accountId: applied.accountId,
        applied,
      });
      markTabAwareDataLoaded(paneHref, depsKey);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setRows([]);
      setSummary(null);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [apiPath, page, pageSize, pageSizeReady, applied, enableSearch, paneHref, depsKey]);

  useEffect(() => {
    setPage(1);
    setApplied((prev) => (prev.search === debouncedSearch ? prev : { ...prev, search: debouncedSearch }));
  }, [debouncedSearch]);

  const hasData = pageSizeReady && (rows.length > 0 || meta != null || summary != null);
  useTabAwareDataLoad(loadReport, { depsKey, hasData });

  function applyFilters() {
    setPage(1);
    setApplied({
      fromDate,
      toDate,
      branchId,
      accountId,
      search: debouncedSearch,
    });
  }

  function refreshReport() {
    invalidateTabAwareDataLoad(paneHref);
    clearTabPaneCache(paneHref, CACHE_SLOT);
    void loadReport();
  }

  const columns = useMemo(() => {
    if (!rows[0]) return [];
    return filterReportColumnKeys(Object.keys(rows[0]), { multiBranch }).filter(
      (k) => !["is_header", "is_total"].includes(k),
    );
  }, [rows, multiBranch]);

  const reportRefresh = useReportRefreshUi({ loading, hasRows: rows.length > 0 });

  const branchLabel = branches.find((b) => String(b.id) === applied.branchId)?.branch_name
    ?? (applied.branchId ? "" : "All branches");

  const accountLabel = accounts.find((a) => String(a.id) === applied.accountId);

  const exportColumns = useMemo(() => {
    if (!columns.length) return [];
    return columns.map((key) => ({
      key,
      label: labelizeKey(key),
      accessor: (row) => {
        if (row.is_header && key !== "section") return "";
        return formatCell(key, row[key]);
      },
    }));
  }, [columns]);

  const exportSearchParams = useMemo(() => {
    const searchParams = {};
    if (applied.fromDate) searchParams.from_date = applied.fromDate;
    if (applied.toDate) searchParams.to_date = applied.toDate;
    if (applied.branchId) searchParams.branch_id = applied.branchId;
    if (applied.accountId) searchParams.account_id = applied.accountId;
    if (enableSearch && String(applied.search ?? "").trim()) {
      searchParams.q = String(applied.search).trim();
    }
    return searchParams;
  }, [applied, enableSearch]);

  const totalPages = meta?.last_page ?? 1;
  const total = meta?.total ?? rows.length;
  const showPagination = Boolean(meta) && (totalPages > 1 || total > pageSize);

  return (
    <CatalogPageShell
      title={title}
      subtitle={subtitle ?? `Accounting > ${title}`}
      action={
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {exportColumns.length ? (
            <ReportExportToolbar
              filename={title}
              title={title}
              subtitle={subtitle ?? ""}
              columns={exportColumns}
              exportSource={{
                path: apiPath,
                searchParams: exportSearchParams,
              }}
              meta={{
                fromDate: applied.fromDate,
                toDate: applied.toDate,
                branchName: branchLabel,
                extraLines: accountLabel ? [`Account: ${accountOptionLabel(accountLabel)}`] : [],
              }}
              disabled={loading}
            />
          ) : null}
          <PrimaryButton type="button" showIcon={false} onClick={() => void refreshReport()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </PrimaryButton>
        </div>
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Link href={backHref} className="text-sm text-[#185FA5] hover:underline">
            ← Accounting
          </Link>
          {enableSearch ? (
            <SearchInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search entry #, account, description…"
              className="min-w-0 w-full flex-1"
            />
          ) : null}
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
          {multiBranch ? (
            <Field label="Branch">
              <SearchableSelect
                className={inputClassName()}
                value={branchId}
                nativeEvent
                onChange={(e) => setBranchId(e.target.value)}
                options={branches.map((b) => ({ value: b.id, label: b.branch_name }))}
              />
            </Field>
          ) : null}
          {showAccountFilter ? (
            <Field label="Account">
              <SearchableSelect
                className={inputClassName()}
                value={accountId}
                nativeEvent
                onChange={(e) => setAccountId(e.target.value)}
                options={accounts.map((a) => ({ value: a.id, label: accountOptionLabel(a) }))}
              />
            </Field>
          ) : null}
          <div className="flex items-end pb-0.5">
            <PrimaryButton type="button" showIcon={false} onClick={applyFilters} disabled={loading}>
              Apply
            </PrimaryButton>
          </div>
        </div>
      }
      banner={
        error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        ) : null
      }
    >
      {intro}
      {summary ? (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Object.entries(summary).map(([key, value]) => (
            <div key={key} className="theme-panel rounded-xl border px-4 py-3 shadow-sm">
              <p className="theme-subtext text-xs font-medium uppercase tracking-wide">
                {SUMMARY_LABELS[key] ?? labelizeKey(key)}
              </p>
              <p className="theme-heading mt-1 text-lg font-semibold">
                {formatAccountingAmount(value)}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className={`theme-panel overflow-hidden rounded-xl border shadow-sm ${reportRefresh.contentClassName}`.trim()}>
        {reportRefresh.showInitialLoading ? (
          <p className="theme-subtext px-5 py-8 text-center text-sm">Loading report…</p>
        ) : rows.length === 0 ? (
          <p className="theme-subtext px-5 py-8 text-center text-sm">{emptyLabel}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="theme-table w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="theme-table-head border-b text-left text-xs font-medium uppercase tracking-wide">
                  {columns.map((col) => (
                    <th key={col} className="whitespace-nowrap px-4 py-2.5">
                      {labelizeKey(col)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const isHeader = row.is_header;
                  const isTotal = row.is_total;
                  return (
                    <tr
                      key={row.id ?? idx}
                      className={
                        isHeader
                          ? "theme-table-section font-semibold"
                          : isTotal
                            ? "theme-table-total border-t font-semibold"
                            : "theme-table-row border-b last:border-b-0"
                      }
                    >
                      {columns.map((col) => (
                        <td key={col} className="whitespace-nowrap px-4 py-2.5">
                          {isHeader && col !== "section" ? "" : formatCell(col, row[col])}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {showPagination ? (
          <PaginationBar
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            pageSizeOptions={pageSizeOptions}
            onChange={setPage}
            onPageSizeChange={(next) => {
              setPageSize(next);
              setPage(1);
            }}
          />
        ) : null}
      </div>
    </CatalogPageShell>
  );
}
