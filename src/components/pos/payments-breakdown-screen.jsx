"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import {
  CatalogPageShell,
  Field,
  PaginationBar,
  SearchInput,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import {
  SettingsSubTabBar,
  useSettingsSubTab,
} from "@/components/admin/settings-sub-tabs";
import { formatAccountingAmount, defaultAccountingDateRange } from "@/lib/accounting-shared";
import { notifyError } from "@/lib/notify";
import { fetchBranchesCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import { isMultiBranchCatalog } from "@/lib/catalog-scope";
import { useDebouncedValue } from "@/lib/use-debounced-value";

function isMpesaMethod(code) {
  return String(code ?? "").toUpperCase() === "MPESA";
}

export function PaymentsBreakdownScreen() {
  const { user } = useAuth();
  const initialRange = defaultAccountingDateRange();
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [branchId, setBranchId] = useState("");
  const [branches, setBranches] = useState([]);
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 300);
  const [methodCode, setMethodCode] = useState("CASH");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const showBranchFilter = isMultiBranchCatalog(user);

  useEffect(() => {
    if (!showBranchFilter) return;
    fetchBranchesCached()
      .then((rows) => setBranches(Array.isArray(rows) ? rows : []))
      .catch(() => setBranches([]));
  }, [showBranchFilter]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/reports/payments-breakdown", {
        searchParams: {
          from_date: fromDate || undefined,
          to_date: toDate || undefined,
          branch_id: branchId || undefined,
          method_code: methodCode || undefined,
          q: debouncedQ.trim() || undefined,
          page,
          per_page: pageSize,
        },
      });
      setData(res);
      if (res?.method_code && res.method_code !== methodCode) {
        setMethodCode(res.method_code);
      }
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load payments breakdown");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, branchId, methodCode, debouncedQ, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const methods = data?.methods ?? [];
  const rows = data?.data ?? [];
  const summary = data?.summary ?? {};

  const tabs = useMemo(
    () =>
      methods.map((method) => ({
        id: method.method_code,
        label: `${method.method_name} · ${formatAccountingAmount(method.total_amount)}`,
      })),
    [methods],
  );

  useSettingsSubTab(methodCode, setMethodCode, tabs);

  const onTabChange = (nextCode) => {
    setMethodCode(nextCode);
    setPage(1);
  };

  const activeIsMpesa = isMpesaMethod(methodCode);
  const showReferenceColumn = activeIsMpesa || String(methodCode).toUpperCase() !== "CASH";
  const refLabel = activeIsMpesa ? "M-Pesa code" : "Reference";
  const emptyMethodLabel = summary.method_name || methodCode || "payment";

  return (
    <CatalogPageShell
      title="Payments breakdown"
      subtitle="Orders paid by tender — Cash, M-Pesa, Card, Bank, and other methods"
    >
      <div className="theme-panel mb-6 grid gap-4 rounded-xl border p-4 shadow-sm md:grid-cols-2 xl:grid-cols-5">
        <Field label="From">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setFromDate(e.target.value);
              setPage(1);
            }}
            className={inputClassName}
          />
        </Field>
        <Field label="To">
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setToDate(e.target.value);
              setPage(1);
            }}
            className={inputClassName}
          />
        </Field>
        {showBranchFilter ? (
          <Field label="Branch">
            <select
              value={branchId}
              onChange={(e) => {
                setBranchId(e.target.value);
                setPage(1);
              }}
              className={inputClassName}
            >
              <option value="">All branches</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.branch_name ?? branch.name ?? `Branch ${branch.id}`}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Search">
          <SearchInput
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder={activeIsMpesa ? "Order # or M-Pesa code…" : "Order # or reference…"}
          />
        </Field>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134a84]"
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Tab total</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatAccountingAmount(summary.total_amount ?? 0)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Orders on tab</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.order_count ?? 0}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">All methods total</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">
            {formatAccountingAmount(summary.grand_total ?? 0)}
          </p>
        </div>
      </div>

      <div className="mb-4">
        <SettingsSubTabBar
          tabs={tabs}
          activeTab={methodCode}
          onTabChange={onTabChange}
          ariaLabel="Payment methods"
        />
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading payments…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500">
          No {emptyMethodLabel} payments in this date range.
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Order</th>
                  {showReferenceColumn ? <th className="px-4 py-3">{refLabel}</th> : null}
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Paid at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.payment_id}>
                    <td className="px-4 py-3">
                      {row.sale_id && row.order_num != null ? (
                        <Link
                          href={`/sales/orders/${row.sale_id}`}
                          className="font-medium text-sky-700 hover:underline"
                        >
                          Order #{row.order_num}
                        </Link>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    {showReferenceColumn ? (
                      <td className="px-4 py-3 font-mono text-slate-800">
                        {row.reference_number || row.mpesa_code || "—"}
                      </td>
                    ) : null}
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {formatAccountingAmount(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.customer_name || "Walk-in"}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {row.paid_at ? formatShortDate(row.paid_at) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4">
            <PaginationBar
              page={data?.current_page ?? page}
              totalPages={data?.last_page ?? 1}
              total={data?.total ?? 0}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
            />
          </div>
        </>
      )}
    </CatalogPageShell>
  );
}
