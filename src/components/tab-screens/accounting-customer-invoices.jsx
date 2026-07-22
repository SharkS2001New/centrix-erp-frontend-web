"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useListUrlSearch } from "@/lib/use-list-url-search";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { canManagePayments } from "@/lib/access-control";
import { P } from "@/lib/permission-codes";
import { useOrgFormat } from "@/lib/org-format";
import { normalizeCustomerInvoice } from "@/lib/customer-invoices";
import { defaultDateRange } from "@/lib/datetime";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  PaginationBar,
  SearchInput,
  SECONDARY_BTN_CLASS,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { CUSTOMER_INVOICE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";


const PAYMENT_STATUS = {
  0: { label: "Unpaid", tone: "text-amber-700 bg-amber-50" },
  1: { label: "Partial", tone: "text-blue-700 bg-blue-50" },
  2: { label: "Paid", tone: "text-emerald-700 bg-emerald-50" },
};

export function AccountingCustomerInvoicesScreen() {
  const searchParams = useSearchParams();
  const presetCustomer = searchParams.get("customer");
  const { hasPermission } = useAuth();
  const { currency, date } = useOrgFormat();
  const canManage =
    canManagePayments({ hasPermission })
    || hasPermission(P.accounting.accounts_receivable.view);

  const [invoices, setInvoices] = useState([]);
  const [totalInvoices, setTotalInvoices] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const { search, setSearch, debouncedSearch } = useListUrlSearch();
  const defaultRange = useMemo(() => defaultDateRange(7), []);
  const [fromDate, setFromDate] = useState(defaultRange.from);
  const [toDate, setToDate] = useState(defaultRange.to);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(20);

  const load = useCallback(async () => {
    setListLoading(true);
    setError(null);
    try {
      const extra = {};
      if (presetCustomer) extra.customer_num = presetCustomer;
      if (statusFilter !== "all") extra.payment_status = statusFilter;
      if (fromDate) extra.from_date = fromDate;
      if (toDate) extra.to_date = toDate;

      const searchParamsApi = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        extra,
      });
      const res = await apiRequest("/customer-invoices", { searchParams: searchParamsApi });
      const parsed = parsePaginator(res);
      setInvoices(parsed.items.map(normalizeCustomerInvoice));
      setTotalInvoices(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load invoices");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, presetCustomer, fromDate, toDate]);

  useTabAwareDataLoad(load);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, presetCustomer, fromDate, toDate]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  return (
    <CatalogPageShell
      title="Customer invoices"
      subtitle="Accounts receivable invoices and balances"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading || listLoading}
            className={SECONDARY_BTN_CLASS}
          >
            {loading || listLoading ? "Refreshing…" : "Refresh"}
          </button>
          <CatalogListExport
            title="Customer invoices"
            filename="customer-invoices"
            apiPath="/customer-invoices"
            columns={CUSTOMER_INVOICE_EXPORT_COLUMNS}
            totalCount={totalInvoices}
            getSearchParams={() => {
              const extra = {};
              if (presetCustomer) extra.customer_num = presetCustomer;
              if (statusFilter !== "all") extra.payment_status = statusFilter;
              if (fromDate) extra.from_date = fromDate;
              if (toDate) extra.to_date = toDate;
              return buildPageParams({ page: 1, perPage: 200, q: debouncedSearch, extra });
            }}
            disabled={loading || listLoading}
          />
        </div>
      }
    >
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
                const balance = Number(inv.balance_due ?? (Number(inv.invoice_total ?? 0) - Number(inv.amount_paid ?? 0)));
                const status = PAYMENT_STATUS[inv.payment_status] ?? PAYMENT_STATUS[0];
                return (
                  <tr key={inv.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-medium">{inv.invoice_number}</td>
                    <td className="px-4 py-3">
                      <Link href={`/customers/${inv.customer_num}`} className="text-[#185FA5] hover:underline">
                        {inv.customer_name ? (
                          <>
                            {inv.customer_name}
                            <span className="ml-1 text-slate-500">#{inv.customer_num}</span>
                          </>
                        ) : (
                          <>#{inv.customer_num}</>
                        )}
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
                      {inv.id != null && String(inv.id) !== "" && /^\d+$/.test(String(inv.id)) ? (
                        <Link href={`/accounting/customer-invoices/${inv.id}`} className="text-[#185FA5] hover:underline">
                          View
                        </Link>
                      ) : (
                        "—"
                      )}
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
        pageSize={pageSize}
        onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
    </CatalogPageShell>
  );
}
