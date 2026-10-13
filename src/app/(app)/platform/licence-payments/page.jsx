"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { notifyError, notifySuccess } from "@/lib/notify";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  FILTER_CONTROL_CLASS,
  FilterSelect,
  FilterToolbar,
  PaginationBar,
  SearchInput,
} from "@/components/catalog/catalog-shared";
import { formatBillingMoney } from "@/lib/platform-billing";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useListPageSize } from "@/lib/use-list-page-controls";

const NOTES = {
  missing_account: "No account number",
  unknown_account: "Account did not match an organisation",
  ambiguous_phone: "Phone matches more than one organisation",
  no_plan: "Organisation has no plan yet",
  no_price: "Plan has no Paybill price",
  awaiting_price: "Waiting for the rest of a plan price",
  stacked: "More than one plan price was covered",
  tokens: "Shillings were added as tokens",
  plan_checkout: "Matched a plan the organisation chose",
  token_checkout: "Matched a token pack the organisation chose",
  industry_mismatch: "Plan belongs to a different industry",
};

const PRODUCTS = {
  monthly: "Monthly",
  yearly: "Yearly",
  token: "Tokens",
};

export default function PlatformLicencePaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [status, setStatus] = useState("all");
  const [product, setProduct] = useState("all");
  const [search, setSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(25);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState(null);
  const debouncedSearch = useDebouncedValue(search, 350);

  useEffect(() => {
    setPage(1);
  }, [status, product, debouncedSearch, fromDate, toDate, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const searchParams = { page, per_page: pageSize };
      if (status !== "all") searchParams.status = status;
      if (product !== "all") searchParams.product = product;
      if (debouncedSearch.trim()) searchParams.q = debouncedSearch.trim();
      if (fromDate) searchParams.from_date = fromDate;
      if (toDate) searchParams.to_date = toDate;
      const rows = await apiRequest("/admin/platform-licence-payments", { searchParams });
      setPayments(Array.isArray(rows.data) ? rows.data : []);
      setMeta({
        current_page: rows.current_page ?? page,
        last_page: rows.last_page ?? 1,
        total: rows.total ?? 0,
        per_page: rows.per_page ?? pageSize,
      });
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not load licence payments.");
      setPayments([]);
      setMeta(null);
    } finally {
      setLoading(false);
    }
  }, [status, product, debouncedSearch, fromDate, toDate, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  async function retry(row) {
    setRetryingId(row.id);
    try {
      const res = await apiRequest(`/admin/platform-licence-payments/${row.id}/retry`, { method: "POST" });
      notifySuccess(res.message || "Payment checked again.");
      await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Could not apply this payment.");
    } finally {
      setRetryingId(null);
    }
  }

  function resetFilters() {
    setSearch("");
    setStatus("all");
    setProduct("all");
    setFromDate("");
    setToDate("");
  }

  const total = meta?.total ?? 0;

  return (
    <CatalogPageShell
      title="Licence payments"
      subtitle="STK and Paybill payments confirmed on the Centrix callback. Filter by organisation, receipt, phone, date, or what the payment bought."
    >
      <AdminBreadcrumb items={[{ label: "Platform", href: "/platform" }, { label: "Licence payments" }]} />

      <FilterToolbar>
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Receipt, organisation, account, phone…"
        />
        <FilterSelect
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: "all", label: "All results" },
            { value: "applied", label: "Applied" },
            { value: "unmatched", label: "Unmatched" },
          ]}
        />
        <FilterSelect
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          options={[
            { value: "all", label: "All products" },
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly" },
            { value: "token", label: "Tokens" },
          ]}
        />
        <label className="block text-xs font-medium text-slate-500">
          From
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className={`mt-1 ${FILTER_CONTROL_CLASS}`}
          />
        </label>
        <label className="block text-xs font-medium text-slate-500">
          To
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className={`mt-1 ${FILTER_CONTROL_CLASS}`}
          />
        </label>
        <button
          type="button"
          onClick={resetFilters}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Reset
        </button>
      </FilterToolbar>

      <div className="theme-panel rounded-xl border shadow-sm">
        {loading ? (
          <p className="px-5 py-8 text-sm text-slate-500">Loading payments…</p>
        ) : payments.length === 0 ? (
          <p className="px-5 py-8 text-sm text-slate-500">No licence payments match these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Organisation</th>
                  <th className="px-5 py-3">Account</th>
                  <th className="px-5 py-3">Phone</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Bought</th>
                  <th className="px-5 py-3">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.map((row) => (
                  <tr key={row.id}>
                    <td className="px-5 py-3 text-slate-600">
                      {row.created_at ? String(row.created_at).slice(0, 16).replace("T", " ") : "—"}
                      <span className="block font-mono text-xs text-slate-400">{row.mpesa_transaction_id}</span>
                    </td>
                    <td className="px-5 py-3">
                      {row.organization?.org_name || "—"}
                      {row.organization?.company_code ? (
                        <span className="block font-mono text-xs text-slate-500">{row.organization.company_code}</span>
                      ) : null}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">{row.account_reference || row.bill_ref_number || "—"}</td>
                    <td className="px-5 py-3 font-mono text-xs">{row.phone_number || "—"}</td>
                    <td className="px-5 py-3 tabular-nums">{formatBillingMoney(row.amount, "KES")}</td>
                    <td className="px-5 py-3">{PRODUCTS[row.product] || "—"}</td>
                    <td className="px-5 py-3">
                      <span className={row.status === "applied" ? "text-emerald-700" : "text-amber-700"}>
                        {row.status === "applied" ? "Applied" : "Unmatched"}
                      </span>
                      {row.note ? (
                        <span className="block text-xs text-slate-500">{NOTES[row.note] || row.note}</span>
                      ) : null}
                      {row.period_end_after ? (
                        <span className="block text-xs text-slate-500">Licence until {String(row.period_end_after).slice(0, 10)}</span>
                      ) : null}
                      {row.status !== "applied" && row.organization_id ? (
                        <button
                          type="button"
                          className="mt-1 text-xs font-medium text-[#185FA5] hover:underline disabled:opacity-50"
                          disabled={retryingId === row.id}
                          onClick={() => void retry(row)}
                        >
                          {retryingId === row.id ? "Checking…" : "Apply again"}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && total > 0 ? (
          <PaginationBar
            page={page}
            totalPages={meta?.last_page ?? 1}
            total={total}
            pageSize={pageSize}
            onChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
          />
        ) : null}
      </div>
    </CatalogPageShell>
  );
}
