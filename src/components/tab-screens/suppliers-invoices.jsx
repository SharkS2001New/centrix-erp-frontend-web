"use client";

import { notifyError } from "@/lib/notify";
import { useListRefreshUi } from "@/lib/list-refresh-ui";
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
import { SUPPLIER_INVOICE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { defaultDateRange } from "@/components/inventory/inventory-shared";
import { formatSupplierKes } from "@/components/suppliers/suppliers-shared";
import { lpoRowDisplayNumber } from "@/components/lpo/lpo-shared";
import { lpoSupplierInvoiceFilePath } from "@/components/lpo/lpo-supplier-invoice-doc";
import { ProtectedFileLink } from "@/components/media/protected-file-preview";

export function SuppliersInvoicesScreen() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const presetSupplier = searchParams.get("supplier_id") ?? searchParams.get("supplier");

  const [invoices, setInvoices] = useState([]);
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
  const initialRange = defaultDateRange(90);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);

  const loadSuppliers = useCallback(async () => {
    try {
      const data = await fetchSuppliersCached(user?.organization_id);
      setSuppliers(data ?? []);
    } catch {
      /* non-blocking */
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
      const res = await apiRequest("/lpo-supplier-invoices", { searchParams: searchParamsApi });
      const parsed = parsePaginator(res);
      setInvoices(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load supplier invoices");
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
  const listRefresh = useListRefreshUi({
    loading,
    listLoading,
    hasRows: invoices.length > 0,
  });
  const tableLoading = listRefresh.showInitialLoading;

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

  return (
    <CatalogPageShell
      title="Supplier invoices"
      subtitle="Documents uploaded when receiving LPO goods — search by invoice number"
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
            title="Supplier invoices"
            filename="supplier-invoices"
            apiPath="/lpo-supplier-invoices"
            columns={SUPPLIER_INVOICE_EXPORT_COLUMNS}
            totalCount={total}
            getSearchParams={buildExportSearchParams}
            disabled={listLoading}
          />
          <Link
            href="/lpo"
            className="inline-flex items-center rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-[#E6F1FB] hover:bg-[#144f8a]"
          >
            Purchase orders
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
            placeholder="Search invoice #, supplier, LPO…"
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
      {!listRefresh.showInitialLoading && (
        <p className="mb-4 text-sm text-slate-600">
          Showing {total} invoice{total === 1 ? "" : "s"}
        </p>
      )}

      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {tableLoading ? (
          <p className="p-8 text-sm text-slate-500">Loading invoices…</p>
        ) : (
          <div className={listRefresh.contentClassName}>
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-sm">
                  <thead>
                    <tr className="theme-table-head-row text-left text-xs font-medium">
                      <th className="px-4 py-2.5">Invoice #</th>
                      <th className="px-4 py-2.5">Supplier</th>
                      <th className="px-4 py-2.5">LPO</th>
                      <th className="px-4 py-2.5">Invoice date</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                      <th className="px-4 py-2.5">Document</th>
                      <th className="px-4 py-2.5">Uploaded</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                          No supplier invoices found.
                        </td>
                      </tr>
                    ) : (
                      invoices.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                        >
                          <td className="px-4 py-3 font-medium text-slate-900">
                            {row.supplier_invoice_number || "—"}
                          </td>
                          <td className="px-4 py-3">
                            {row.supplier_id ? (
                              <Link
                                href={`/suppliers/${row.supplier_id}`}
                                className="font-medium text-[#185FA5] hover:underline"
                              >
                                {row.supplier_name ?? "—"}
                              </Link>
                            ) : (
                              (row.supplier_name ?? "—")
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-700">
                            {row.lpo_no ? (
                              <Link
                                href={`/lpo/${row.lpo_no}`}
                                className="text-[#185FA5] hover:underline"
                              >
                                {lpoRowDisplayNumber(row)}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-3">{formatShortDate(row.invoice_date)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-800">
                            {row.invoice_amount != null ? formatSupplierKes(row.invoice_amount) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            {row.has_document ? (
                              <ProtectedFileLink
                                filePath={lpoSupplierInvoiceFilePath(row.id)}
                                label={row.file_name || "View"}
                                title={`Supplier invoice ${row.supplier_invoice_number ?? ""}`}
                                className="text-sm font-medium text-[#185FA5] hover:underline"
                              />
                            ) : (
                              <span className="text-slate-400">No file</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {formatShortDate(row.created_at)}
                          </td>
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
          </div>
        )}
      </div>
    </CatalogPageShell>
  );
}
