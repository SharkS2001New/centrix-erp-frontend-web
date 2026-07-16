"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { fetchBranchesCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { filterReportColumnKeys, reportColumnLabel } from "@/lib/reports/report-column-visibility";
import { normalizeReportRows } from "@/lib/reports/api-response";
import { parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  CatalogPageShell,
  Field,
  PaginationBar,
  PrimaryButton,
  SearchInput,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { accountOptionLabel, formatAccountingAmount, defaultAccountingDateRange } from "@/lib/accounting-shared";
import { defaultReportDateRange } from "@/lib/reports/report-filters";
import { ReportExportToolbar } from "@/components/reports/report-export-toolbar";

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
  defaultDateRangeDays = null,
}) {
  const { user, capabilities, isOrgWide } = useAuth();
  const multiBranch = isMultiBranchCatalog(capabilities);
  const monthRange = useMemo(
    () => (defaultDateRangeDays != null ? defaultReportDateRange(defaultDateRangeDays) : defaultAccountingDateRange()),
    [defaultDateRangeDays],
  );
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [meta, setMeta] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState(monthRange.from);
  const [toDate, setToDate] = useState(monthRange.to);
  const [branchId, setBranchId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [branches, setBranches] = useState([]);

  useEffect(() => {
    fetchBranchesCached()
      .then((rows) => setBranches(rows ?? []))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (!showAccountFilter) return;
    apiRequest("/chart-of-accounts", { searchParams: { per_page: 200 } })
      .then((res) => setAccounts(res.data ?? []))
      .catch(() => setAccounts([]));
  }, [showAccountFilter]);

  useEffect(() => {
    // Only scope to home branch for branch-limited users; org-wide / single-branch
    // catalogs default to all posted activity (no silent branch filter).
    if (!multiBranch || isOrgWide?.() || branchId || !user?.branch_id) return;
    setBranchId(String(user.branch_id));
  }, [user?.branch_id, branchId, multiBranch, isOrgWide]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParams = { per_page: 50, page };
      if (fromDate) searchParams.from_date = fromDate;
      if (toDate) searchParams.to_date = toDate;
      if (branchId) searchParams.branch_id = branchId;
      if (accountId) searchParams.account_id = accountId;
      if (enableSearch && debouncedSearch.trim()) searchParams.q = debouncedSearch.trim();

      const res = await apiRequest(apiPath, { searchParams });
      if (res?.current_page != null || res?.last_page != null || res?.total != null) {
        const parsed = parsePaginator(res);
        setRows(parsed.items);
        setMeta({
          last_page: parsed.totalPages,
          total: parsed.total,
          current_page: parsed.page,
          per_page: parsed.perPage,
        });
      } else {
        setRows(normalizeReportRows(res));
        setMeta(res.meta ?? null);
      }
      setSummary(res.summary ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setRows([]);
      setSummary(null);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [apiPath, page, fromDate, toDate, branchId, accountId, enableSearch, debouncedSearch]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const columns = useMemo(() => {
    if (!rows[0]) return [];
    return filterReportColumnKeys(Object.keys(rows[0]), { multiBranch }).filter(
      (k) => !["is_header", "is_total"].includes(k),
    );
  }, [rows, multiBranch]);

  const branchLabel = branches.find((b) => String(b.id) === branchId)?.branch_name
    ?? (branchId ? "" : "All branches");

  const accountLabel = accounts.find((a) => String(a.id) === accountId);

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
    if (fromDate) searchParams.from_date = fromDate;
    if (toDate) searchParams.to_date = toDate;
    if (branchId) searchParams.branch_id = branchId;
    if (accountId) searchParams.account_id = accountId;
    if (enableSearch && debouncedSearch.trim()) searchParams.q = debouncedSearch.trim();
    return searchParams;
  }, [accountId, branchId, debouncedSearch, enableSearch, fromDate, toDate]);

  const pageSize = meta?.per_page ?? 50;
  const totalPages = meta?.last_page ?? 1;
  const total = meta?.total ?? rows.length;
  const showPagination = Boolean(meta) && (totalPages > 1 || total > pageSize);

  return (
    <CatalogPageShell
      title={title}
      subtitle={subtitle ?? `Accounting > ${title}`}
      action={
        exportColumns.length ? (
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
              fromDate,
              toDate,
              branchName: branchLabel,
              extraLines: accountLabel ? [`Account: ${accountOptionLabel(accountLabel)}`] : [],
            }}
            disabled={loading}
          />
        ) : null
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
              className="min-w-[220px] flex-1"
            />
          ) : null}
          <Field label="From">
            <input
              type="date"
              className={inputClassName()}
              value={fromDate}
              onChange={(e) => {
                setPage(1);
                setFromDate(e.target.value);
              }}
            />
          </Field>
          <Field label="To">
            <input
              type="date"
              className={inputClassName()}
              value={toDate}
              onChange={(e) => {
                setPage(1);
                setToDate(e.target.value);
              }}
            />
          </Field>
          {multiBranch ? (
            <Field label="Branch">
              <select
                className={inputClassName()}
                value={branchId}
                onChange={(e) => {
                  setPage(1);
                  setBranchId(e.target.value);
                }}
              >
                <option value="">All branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.branch_name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {showAccountFilter ? (
            <Field label="Account">
              <select
                className={inputClassName()}
                value={accountId}
                onChange={(e) => {
                  setPage(1);
                  setAccountId(e.target.value);
                }}
              >
                <option value="">All accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {accountOptionLabel(a)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <PrimaryButton type="button" showIcon={false} onClick={() => void loadReport()}>
            Refresh
          </PrimaryButton>
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

      <div className="theme-panel overflow-hidden rounded-xl border shadow-sm">
        {loading ? (
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
          <PaginationBar page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} />
        ) : null}
      </div>
    </CatalogPageShell>
  );
}
