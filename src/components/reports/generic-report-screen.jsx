"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { ReportExportToolbar } from "@/components/reports/report-export-toolbar";
import { normalizeReportMeta, normalizeReportRows } from "@/lib/reports/api-response";
import { reportVatKpis } from "@/lib/reports/vat-summary";
import { formatReportKes } from "@/lib/reports/format";
import { ReportKpiGrid } from "@/components/reports/report-screen-shared";
import {
  CatalogPageShell,
  Field,
  FILTER_CONTROL_CLASS,
  FilterToolbar,
  PaginationBar,
  PrimaryButton,
  formatShortDate,
} from "@/components/catalog/catalog-shared";

const DATE_COLUMNS = {
  "sales-by-product": "sale_date",
  "sales-by-supplier": "sale_date",
  "sales-by-user": "sale_date",
  "sales-by-channel": "sale_date",
  "daily-sales": "sale_day",
  "mobile-route-sales": "loading_date",
  "dispatch-trips": "scheduled_date",
  "trip-cash-settlement": "scheduled_date",
  "pod-compliance": "capture_date",
  "driver-deliveries": "delivery_date",
  "sales-pipeline": "order_date",
  "vat-collected": "sale_date",
  "category-sales": "sale_date",
  "discount-summary": "sale_date",
  "payment-collection": "payment_date",
  "credit-outstanding": "sale_date",
  "stock-movement": "entry_date",
  "stock-transfers": "transfer_date",
  "branch-stock-transfers": "transfer_date",
  returns: "return_date",
  "expenses": "expense_date",
  "journal-register": "entry_date",
  "general-ledger": "entry_date",
  "trial-balance": "entry_date",
  "balance-sheet": "entry_date",
  "profit-loss-gl": "entry_date",
  "cash-flow": "entry_date",
  "invoice-payments": "date_paid",
  "kra-receipts": "receipt_date",
  "till-sessions": "session_date",
  "audit-trail": "created_at",
  "statutory-deductions": "run_date",
  "bank-transfer": "run_date",
  headcount: "hire_date",
  "contract-expiry": "contract_end_date",
};

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
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const PAGE_SIZE = 20;

const REPORTS_WITHOUT_DATE_FILTER = new Set(["price-list"]);

const LEGACY_ARCHIVE_REPORT_KEYS = new Set(["sales-by-channel"]);

export function GenericReportScreen({ reportKey, label, apiPath, subtitle }) {
  const urlParams = useSearchParams();
  const payrollRunId = urlParams.get("payroll_run_id") ?? "";
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState([]);
  const [includeLegacyArchive, setIncludeLegacyArchive] = useState(false);
  const [legacyArchiveMeta, setLegacyArchiveMeta] = useState(null);
  const [legacyRows, setLegacyRows] = useState([]);
  const [legacyPage, setLegacyPage] = useState(1);

  const supportsLegacyArchive = LEGACY_ARCHIVE_REPORT_KEYS.has(reportKey);
  const showDateFilters = !REPORTS_WITHOUT_DATE_FILTER.has(reportKey);
  const dateColumn = DATE_COLUMNS[reportKey] ?? "sale_date";

  useEffect(() => {
    apiRequest("/branches", { searchParams: { per_page: 100 } })
      .then((res) => setBranches(res.data ?? []))
      .catch(() => setBranches([]));
  }, []);

  useEffect(() => {
    if (user?.branch_id && !branchId) setBranchId(String(user.branch_id));
  }, [user?.branch_id, branchId]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const searchParams = {
        per_page: PAGE_SIZE,
        page,
      };
      if (showDateFilters) {
        searchParams.date_column = dateColumn;
        if (fromDate) searchParams.from_date = fromDate;
        if (toDate) searchParams.to_date = toDate;
      }
      if (branchId) searchParams.branch_id = branchId;
      if (payrollRunId) searchParams.payroll_run_id = payrollRunId;
      if (supportsLegacyArchive && includeLegacyArchive) {
        searchParams.include_legacy_archive = 1;
        searchParams.legacy_page = legacyPage;
      }

      const res = await apiRequest(apiPath, { searchParams });
      const centrixRows = normalizeReportRows(res);
      setRows(centrixRows);
      setMeta(normalizeReportMeta(res, page, PAGE_SIZE));
      setLegacyArchiveMeta(res.legacy_archive ?? null);
      setLegacyRows(res.legacy_archive?.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setRows([]);
      setMeta(null);
      setLegacyArchiveMeta(null);
      setLegacyRows([]);
    } finally {
      setLoading(false);
    }
  }, [apiPath, page, legacyPage, fromDate, toDate, branchId, dateColumn, payrollRunId, supportsLegacyArchive, includeLegacyArchive, showDateFilters]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const columns = useMemo(() => {
    if (!rows[0]) return [];
    return Object.keys(rows[0]).filter((k) => !k.startsWith("_"));
  }, [rows]);

  const branchLabel = branches.find((b) => String(b.id) === branchId)?.branch_name
    ?? (branchId ? "" : "All branches");

  const exportColumns = useMemo(() => {
    const sample = rows[0] ?? legacyRows[0];
    if (!sample) return [];
    return Object.keys(sample)
      .filter((k) => !k.startsWith("_"))
      .map((key) => ({
        key,
        label: labelizeKey(key),
        accessor: (row) => formatCell(key, row[key]),
      }));
  }, [rows, legacyRows]);

  const exportSearchParams = useMemo(() => {
    const searchParams = {};
    if (showDateFilters) {
      searchParams.date_column = dateColumn;
      if (fromDate) searchParams.from_date = fromDate;
      if (toDate) searchParams.to_date = toDate;
    }
    if (branchId) searchParams.branch_id = branchId;
    if (payrollRunId) searchParams.payroll_run_id = payrollRunId;
    if (supportsLegacyArchive && includeLegacyArchive) {
      searchParams.include_legacy_archive = 1;
    }
    return searchParams;
  }, [branchId, dateColumn, fromDate, payrollRunId, showDateFilters, toDate, supportsLegacyArchive, includeLegacyArchive]);

  const totalPages = meta?.last_page ?? 1;
  const total = meta?.total ?? rows.length;
  const legacyMeta = legacyArchiveMeta?.meta;
  const legacyTotalPages = legacyMeta?.last_page ?? 1;

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
              legacyMerge:
                supportsLegacyArchive && includeLegacyArchive && legacyArchiveMeta?.available,
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
          {supportsLegacyArchive ? (
            <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={includeLegacyArchive}
                onChange={(e) => {
                  setPage(1);
                  setIncludeLegacyArchive(e.target.checked);
                }}
              />
              Include legacy archive
            </label>
          ) : null}
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
        ) : legacyArchiveMeta?.available && (legacyArchiveMeta.meta?.total ?? 0) > 0 ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            Showing <strong>{legacyRows.length}</strong> of <strong>{legacyArchiveMeta.meta.total}</strong> legacy
            archive row(s) on this page — see{" "}
            <Link href="/reports/legacy-archive" className="font-medium text-[#185FA5] hover:underline">
              Legacy sales archive
            </Link>{" "}
            to materialize individual sales for returns.
          </p>
        ) : legacyArchiveMeta?.requires_date_range && includeLegacyArchive ? (
          <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            {legacyArchiveMeta.message ?? "Set from and to dates to load legacy archive rows."}
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
                  <tr
                    key={row.id ?? idx}
                    className={`border-b border-slate-100 last:border-b-0 ${row.legacy_archive ? "bg-amber-50/50" : ""}`}
                  >
                    {columns.map((col) => (
                      <td key={col} className="whitespace-nowrap px-4 py-2.5 text-slate-800">
                        {formatCell(col, row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onChange={setPage} />
      </div>
      {includeLegacyArchive && legacyRows.length > 0 ? (
        <div className="mt-6 overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
          <p className="border-b border-amber-100 bg-amber-50 px-5 py-3 text-sm font-medium text-amber-950">
            Legacy archive rows
          </p>
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
                {legacyRows.map((row, idx) => (
                  <tr key={`legacy-${idx}`} className="border-b border-slate-100 bg-amber-50/50 last:border-b-0">
                    {columns.map((col) => (
                      <td key={col} className="whitespace-nowrap px-4 py-2.5 text-slate-800">
                        {formatCell(col, row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar
            page={legacyPage}
            totalPages={legacyTotalPages}
            total={legacyMeta?.total ?? legacyRows.length}
            pageSize={legacyMeta?.per_page ?? PAGE_SIZE}
            onChange={(next) => {
              setLegacyPage(next);
            }}
          />
        </div>
      ) : null}
    </CatalogPageShell>
    </>
  );
}
