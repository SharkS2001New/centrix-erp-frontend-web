"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  Field,
  PaginationBar,
  PrimaryButton,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";

const DATE_COLUMNS = {
  "sales-by-product": "sale_date",
  "sales-by-user": "sale_date",
  "sales-by-channel": "sale_date",
  "daily-sales": "sale_day",
  "mobile-route-sales": "loading_date",
  "sales-pipeline": "order_date",
  "vat-collected": "sale_date",
  "category-sales": "sale_date",
  "discount-summary": "sale_date",
  "payment-collection": "payment_date",
  "credit-outstanding": "sale_date",
  "stock-movement": "entry_date",
  "returns": "return_date",
  "expenses": "expense_date",
  "journal-register": "entry_date",
  "general-ledger": "entry_date",
  "trial-balance": "entry_date",
  "balance-sheet": "entry_date",
  "profit-loss-gl": "entry_date",
  "cash-flow": "entry_date",
  "invoice-payments": "payment_date",
  "kra-receipts": "receipt_date",
  "till-sessions": "session_date",
  "audit-trail": "created_at",
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

export function GenericReportScreen({ reportKey, label, apiPath }) {
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
        per_page: 50,
        page,
        date_column: dateColumn,
      };
      if (fromDate) searchParams.from_date = fromDate;
      if (toDate) searchParams.to_date = toDate;
      if (branchId) searchParams.branch_id = branchId;

      const res = await apiRequest(apiPath, { searchParams });
      setRows(res.data ?? []);
      setMeta(res.meta ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      setRows([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [apiPath, page, fromDate, toDate, branchId, dateColumn]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const columns = useMemo(() => {
    if (!rows[0]) return [];
    return Object.keys(rows[0]).filter((k) => !k.startsWith("_"));
  }, [rows]);

  const totalPages = meta?.last_page ?? 1;
  const total = meta?.total ?? rows.length;

  return (
    <CatalogPageShell
      title={label ?? "Report"}
      subtitle={apiPath}
      toolbar={
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Link href="/reports" className="text-sm text-[#185FA5] hover:underline">
            ← All reports
          </Link>
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
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Loading report…</p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No rows for this filter.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
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
                        {formatCell(col, row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar page={page} totalPages={totalPages} total={total} pageSize={50} onChange={setPage} />
      </div>
    </CatalogPageShell>
  );
}
