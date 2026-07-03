"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { filterReportColumnKeys, reportColumnLabel } from "@/lib/reports/report-column-visibility";
import { ReportExportToolbar } from "@/components/reports/report-export-toolbar";
import { normalizeReportMeta, normalizeReportRows } from "@/lib/reports/api-response";
import { defaultReportBranchId, defaultReportDateRange } from "@/lib/reports/report-filters";
import {
  buildReportQueryParams,
  reportShowsDateRange,
} from "@/lib/reports/report-filter-config";
import { useReportFilterOptions } from "@/lib/reports/use-report-filter-options";
import { ReportQueryFilterFields } from "@/components/reports/report-query-filter-fields";
import { reportVatKpis } from "@/lib/reports/vat-summary";
import { formatReportKes } from "@/lib/reports/format";
import { ReportKpiGrid } from "@/components/reports/report-screen-shared";
import { ReportCellLink } from "@/components/reports/report-cell-link";
import {
  CatalogPageShell,
  Field,
  FILTER_CONTROL_CLASS,
  FilterToolbar,
  PaginationBar,
  PrimaryButton,
  formatShortDate,
} from "@/components/catalog/catalog-shared";

const PAGE_SIZE = 20;

function formatCell(key, value) {
  if (value == null || value === "") return "—";
  if (typeof value === "number") {
    if (/amount|total|paid|balance|vat|gross|net|price|cost|kes/i.test(key)) {
      return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    return String(value);
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return formatShortDate(value);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

function labelizeKey(key) {
  return reportColumnLabel(key);
}

export function GenericReportScreen({ reportKey, label, apiPath, subtitle }) {
  const urlParams = useSearchParams();
  const payrollRunId = urlParams.get("payroll_run_id") ?? "";
  const { user, isOrgWide, capabilities } = useAuth();
  const multiBranch = isMultiBranchCatalog(capabilities);
  const defaultRange = useMemo(() => defaultReportDateRange(), []);
  const branchInitialized = useRef(false);
  const filterOptions = useReportFilterOptions(reportKey);
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [branchId, setBranchId] = useState("");
  const [queryFilters, setQueryFilters] = useState({});
  const [branches, setBranches] = useState([]);

  const showDateFilters = reportShowsDateRange(reportKey);

  useEffect(() => {
    apiRequest("/branches", { searchParams: { per_page: 100 } })
      .then((res) => setBranches(res.data ?? []))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (!user || branchInitialized.current) return;
    branchInitialized.current = true;
    setBranchId(defaultReportBranchId(user, isOrgWide));
  }, [user, isOrgWide]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParams = {
        per_page: PAGE_SIZE,
        page,
        ...buildReportQueryParams(reportKey, {
          fromDate,
          toDate,
          branchId,
          extraValues: queryFilters,
        }),
      };
      if (payrollRunId) searchParams.payroll_run_id = payrollRunId;

      const res = await apiRequest(apiPath, { searchParams });
      const centrixRows = normalizeReportRows(res);
      setRows(centrixRows);
      setMeta(normalizeReportMeta(res, page, PAGE_SIZE));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [apiPath, page, fromDate, toDate, branchId, queryFilters, payrollRunId, reportKey]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const columns = useMemo(() => {
    if (!rows[0]) return [];
    return filterReportColumnKeys(Object.keys(rows[0]), { multiBranch });
  }, [rows, multiBranch]);

  const footerTotals = useMemo(() => {
    if (!rows.length || !columns.length) return {};
    const totals = {};
    for (const col of columns) {
      if (!/amount|total|paid|balance|vat|gross|net|qty|quantity|count|orders|revenue|collected|discount|credit|debit|sales|profit|expense|due|outstanding|variance|float/i.test(col)) {
        continue;
      }
      const sum = rows.reduce((acc, row) => acc + (Number(row[col]) || 0), 0);
      totals[col] = formatCell(col, sum);
    }
    return totals;
  }, [rows, columns]);

  const branchLabel = branches.find((b) => String(b.id) === branchId)?.branch_name
    ?? (branchId ? "" : "All branches");

  const exportColumns = useMemo(() => {
    const sample = rows[0];
    if (!sample) return [];
    return filterReportColumnKeys(Object.keys(sample), { multiBranch }).map((key) => ({
      key,
      label: labelizeKey(key),
      accessor: (row) => formatCell(key, row[key]),
    }));
  }, [rows, multiBranch]);

  const exportSearchParams = useMemo(() => {
    const searchParams = buildReportQueryParams(reportKey, {
      fromDate,
      toDate,
      branchId,
      extraValues: queryFilters,
    });
    if (payrollRunId) searchParams.payroll_run_id = payrollRunId;
    return searchParams;
  }, [branchId, fromDate, toDate, queryFilters, payrollRunId, reportKey]);

  const totalPages = meta?.last_page ?? 1;
  const total = meta?.total ?? rows.length;

  const vatKpis = useMemo(
    () => reportVatKpis(rows, (value) => formatReportKes(value)),
    [rows],
  );

  return (
    <>
      <CatalogPageShell
      title={label ?? "Report"}
      subtitle={subtitle ?? undefined}
      action={
        exportColumns.length ? (
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
            }}
            disabled={loading}
          />
        ) : null
      }
      toolbar={
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
                  onChange={(e) => {
                    setPage(1);
                    setFromDate(e.target.value);
                  }}
                />
              </Field>
              <Field label="To">
                <input
                  type="date"
                  className={FILTER_CONTROL_CLASS}
                  value={toDate}
                  onChange={(e) => {
                    setPage(1);
                    setToDate(e.target.value);
                  }}
                />
              </Field>
            </>
          ) : null}
          {multiBranch ? (
            <Field label="Branch">
              <select
                className={FILTER_CONTROL_CLASS}
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
          <ReportQueryFilterFields
            reportKey={reportKey}
            values={queryFilters}
            onChange={(id, value) => {
              setPage(1);
              setQueryFilters((prev) => ({ ...prev, [id]: value }));
            }}
            optionsByKey={filterOptions}
          />
          <PrimaryButton type="button" showIcon={false} onClick={() => void loadReport()}>
            Refresh
          </PrimaryButton>
        </FilterToolbar>
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
      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
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
                        {idx === 0 ? "Totals (this page)" : footerTotals[col] ?? ""}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              ) : null}
            </table>
          </div>
        )}
        <PaginationBar page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
    </CatalogPageShell>
    </>
  );
}
