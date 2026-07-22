"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useState } from "react";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { fetchSuppliersCached } from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  PaginationBar,
  SearchInput,
  SECONDARY_BTN_CLASS,
  formatShortDate,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { SUPPLIER_PAYMENT_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { defaultDateRange } from "@/components/inventory/inventory-shared";
import { formatSupplierKes, formatSupplierPaymentReference } from "@/components/suppliers/suppliers-shared";
import { lpoRowDisplayNumber } from "@/components/lpo/lpo-shared";


export function SuppliersPaymentsScreen() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const presetSupplier = searchParams.get("supplier_id") ?? searchParams.get("supplier");

  const [payments, setPayments] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [supplierFilter, setSupplierFilter] = useState(presetSupplier ?? "all");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(15);
  const initialRange = defaultDateRange(7);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await fetchSuppliersCached(user?.organization_id);
      setSuppliers(data ?? []);
    } catch {
      /* non-blocking — supplier filter degrades gracefully */
    }
  }, [user?.organization_id]);

  const loadData = useCallback(async () => {
    setListLoading(true);
    try {
      const searchParamsApi = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        extra: {
          date_from: fromDate || undefined,
          date_to: toDate || undefined,
          supplier_id: supplierFilter !== "all" ? supplierFilter : undefined,
        },
      });
      const payRes = await apiRequest("/supplier-payments", { searchParams: searchParamsApi });
      const parsed = parsePaginator(payRes);
      setPayments(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load payments");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [page, pageSize, debouncedSearch, supplierFilter, fromDate, toDate]);

  useTabAwareDataLoad(loadSuppliers);
  useTabAwareDataLoad(loadData);

  useEffect(() => {
    if (presetSupplier) setSupplierFilter(presetSupplier);
  }, [presetSupplier]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, supplierFilter, fromDate, toDate]);

  const safePage = Math.min(page, totalPages);
  const tableLoading = loading || (listLoading && payments.length === 0);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  const buildExportSearchParams = useCallback(
    () =>
      buildPageParams({
        page: 1,
        perPage: 100,
        q: debouncedSearch,
        extra: {
          date_from: fromDate || undefined,
          date_to: toDate || undefined,
          supplier_id: supplierFilter !== "all" ? supplierFilter : undefined,
        },
      }),
    [debouncedSearch, fromDate, toDate, supplierFilter],
  );

  const pageTotalPaid = payments.reduce((sum, p) => sum + Number(p.amount_paid ?? 0), 0);

  return (
    <CatalogPageShell
      title="Supplier Payments"
      subtitle="Pay suppliers for purchases (accounts payable)"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={listLoading}
            className={SECONDARY_BTN_CLASS}
          >
            {listLoading ? "Refreshing…" : "Refresh"}
          </button>
          <CatalogListExport
            title="Supplier payments"
            filename="supplier-payments"
            apiPath="/supplier-payments"
            columns={SUPPLIER_PAYMENT_EXPORT_COLUMNS}
            totalCount={total}
            getSearchParams={buildExportSearchParams}
            disabled={listLoading}
          />
          <Link
          href={
            supplierFilter !== "all"
              ? `/suppliers/payments/new?supplier_id=${supplierFilter}&return=payments`
              : "/suppliers/payments/new?return=payments"
          }
          className="inline-flex items-center rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
        >
          Record payment
        </Link>
        </div>
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-end gap-3">
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
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, supplier…"
          />
          <FilterSelect
            value={supplierFilter}
            onChange={(e) => setSupplierFilter(e.target.value)}
            options={[
              { value: "all", label: "All suppliers" },
              ...suppliers.map((s) => ({
                value: String(s.id),
                label: s.supplier_name,
              })),
            ]}
          />
        </div>
      }
    >
      {!tableLoading && (
        <p className="mb-4 text-sm text-slate-600">
          Showing {total} payment{total === 1 ? "" : "s"}
          {payments.length > 0 ? (
            <>
              {" "}
              · this page{" "}
              <span className="font-medium text-slate-900">{formatSupplierKes(pageTotalPaid)}</span>
            </>
          ) : null}
        </p>
      )}

      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {tableLoading ? (
          <p className="p-8 text-sm text-slate-500">Loading payments…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <th className="px-4 py-2.5">Date</th>
                    <th className="px-4 py-2.5">Supplier</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5">Type</th>
                    <th className="px-4 py-2.5">LPO</th>
                    <th className="px-4 py-2.5">Method</th>
                    <th className="px-4 py-2.5">Reference</th>
                    <th className="px-4 py-2.5">Paid by</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        No payments found.
                      </td>
                    </tr>
                  ) : (
                    payments.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <td className="px-4 py-3">{formatShortDate(row.date_paid)}</td>
                        <td className="px-4 py-3">
                          <Link
                            href={`/suppliers/${row.supplier_id}`}
                            className="font-medium text-[#185FA5] hover:underline"
                          >
                            {row.supplier_name ?? "—"}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-700">
                          {formatSupplierKes(row.amount_paid)}
                          {row.amount_due_snapshot > row.amount_paid ? (
                            <span className="block text-xs font-normal text-slate-500">
                              of {formatSupplierKes(row.amount_due_snapshot)}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3">
                          {row.is_partial ? (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                              Partial
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                              Full
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-700">
                          {row.lpo_no ? lpoRowDisplayNumber(row) : "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">{row.payment_method}</td>
                        <td className="px-4 py-3 text-slate-600">
                          {formatSupplierPaymentReference(row)}
                        </td>
                        <td className="px-4 py-3 text-slate-600">{row.paid_by_name}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={total}
              pageSize={pageSize}
              onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
          </>
        )}
      </div>

    </CatalogPageShell>
  );
}
