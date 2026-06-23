"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { useAuth } from "@/contexts/auth-context";
import { P } from "@/lib/permission-codes";
import { useOrgFormat } from "@/lib/org-format";
import {
  CatalogPageShell,
  FilterSelect,
  PaginationBar,
  SearchInput,
} from "@/components/catalog/catalog-shared";

const PAGE_SIZE = 20;

const PAYMENT_STATUS = {
  0: { label: "Unpaid", tone: "text-amber-700 bg-amber-50" },
  1: { label: "Partial", tone: "text-blue-700 bg-blue-50" },
  2: { label: "Paid", tone: "text-emerald-700 bg-emerald-50" },
};

export default function CustomerInvoicesPage() {
  const searchParams = useSearchParams();
  const presetCustomer = searchParams.get("customer");
  const { hasPermission } = useAuth();
  const { currency, date } = useOrgFormat();
  const canManage = hasPermission(P.payments.customer_invoices.manage);

  const [invoices, setInvoices] = useState([]);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const extra = {};
      if (presetCustomer) extra.customer_num = presetCustomer;
      if (statusFilter !== "all") extra.payment_status = statusFilter;

      const searchParamsApi = buildPageParams({
        page,
        perPage: PAGE_SIZE,
        q: debouncedSearch,
        extra,
      });
      const res = await apiRequest("/customer-invoices", { searchParams: searchParamsApi });
      const parsed = parsePaginator(res);
      setInvoices(parsed.items);
      setTotalInvoices(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load invoices");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [page, debouncedSearch, statusFilter, presetCustomer]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, presetCustomer]);

  return (
    <CatalogPageShell title="Customer invoices" subtitle="Accounts receivable invoices and balances">
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search invoice #, customer…"
          className="min-w-[220px]"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          options={[
            { value: "all", label: "All statuses" },
            { value: "0", label: "Unpaid" },
            { value: "1", label: "Partial" },
            { value: "2", label: "Paid" },
          ]}
        />
      </div>

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <div className={`theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm ${listLoading ? "opacity-60" : ""}`}>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3 text-right">Total</th>
              <th className="px-4 py-3 text-right">Paid</th>
              <th className="px-4 py-3 text-right">Balance</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                  No invoices found.
                </td>
              </tr>
            ) : (
              invoices.map((inv) => {
                const balance = Number(inv.invoice_total ?? 0) - Number(inv.amount_paid ?? 0);
                const status = PAYMENT_STATUS[inv.payment_status] ?? PAYMENT_STATUS[0];
                return (
                  <tr key={inv.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
                    <td className="px-4 py-3">
                      <Link href={`/customers/${inv.customer_num}`} className="text-[#185FA5] hover:underline">
                        #{inv.customer_num}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{date(inv.invoice_date)}</td>
                    <td className="px-4 py-3 text-right">{currency(inv.invoice_total)}</td>
                    <td className="px-4 py-3 text-right">{currency(inv.amount_paid)}</td>
                    <td className="px-4 py-3 text-right font-medium">{currency(balance)}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.tone}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link href={`/accounting/customer-invoices/${inv.id}`} className="text-[#185FA5] hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <PaginationBar
        page={page}
        totalPages={totalPages}
        total={totalInvoices}
        pageSize={PAGE_SIZE}
        onChange={setPage}
      />
    </CatalogPageShell>
  );
}
