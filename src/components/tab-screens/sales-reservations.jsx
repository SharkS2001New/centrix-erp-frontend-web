"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useState } from "react";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import {
  CatalogPageShell,
  FilterToolbar,
  PaginationBar,
  SearchInput,
  SECONDARY_BTN_CLASS,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { STOCK_RESERVATION_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { formatReceiptNumber } from "@/components/sales/sales-shared";


export function SalesReservationsScreen() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(25);

  const loadData = useCallback(async () => {
    setListLoading(true);
    try {
      const searchParams = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        extra: { active: 1 },
      });
      const res = await apiRequest("/stock-reservations", { searchParams });
      const parsed = parsePaginator(res);
      setRows(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load reservations");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [page, pageSize, debouncedSearch]);

  useTabAwareDataLoad(loadData);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const safePage = Math.min(page, totalPages);
  const tableLoading = loading || (listLoading && rows.length === 0);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const handlePageSizeChange = useCallback(
    (size) => {
      setPageSize(size);
      setPage(1);
    },
    [setPageSize],
  );

  const buildExportSearchParams = useCallback(
    () =>
      buildPageParams({
        page: 1,
        perPage: 100,
        q: debouncedSearch,
        extra: { active: 1 },
      }),
    [debouncedSearch],
  );

  return (
    <CatalogPageShell
      title="Reserved stock"
      subtitle="Stock held for open carts and pending orders"
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
            title="Stock reservations"
            filename="stock-reservations"
            apiPath="/stock-reservations"
            columns={STOCK_RESERVATION_EXPORT_COLUMNS}
            totalCount={total}
            getSearchParams={buildExportSearchParams}
            disabled={listLoading}
          />
        </div>
      }
      toolbar={
        <FilterToolbar>
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order, product…"
          />
        </FilterToolbar>
      }
    >
      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {tableLoading ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Loading reservations…</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="theme-table-head-row text-left text-xs font-medium">
                <th className="px-4 py-2.5">Order</th>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5 text-right">Qty</th>
                <th className="px-4 py-2.5">Location</th>
                <th className="px-4 py-2.5">Reserved</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-500">
                    No active reservations.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const sale = row.sale;
                  const orderLabel = sale
                    ? formatReceiptNumber(sale)
                    : row.cart_id
                      ? `Cart #${row.cart_id}`
                      : "—";
                  return (
                    <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                      <td className="px-4 py-3">
                        {sale ? (
                          <Link
                            href={`/sales/orders/${sale.id}`}
                            className="font-medium text-[#185FA5] hover:underline"
                          >
                            {orderLabel}
                          </Link>
                        ) : (
                          <span className="text-slate-700">{orderLabel}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {row.product_name || row.product_code}
                        </div>
                        {row.product_name &&
                        row.product_name !== row.product_code ? (
                          <div className="mt-0.5 text-xs text-slate-500">
                            {row.product_code}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-700">{row.quantity}</td>
                      <td className="px-4 py-3 text-slate-600">{row.stock_location ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatShortDate(row.created_at)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          total={total}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </CatalogPageShell>
  );
}
