"use client";

import { notifyError } from "@/lib/notify";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import {
  CatalogPageShell,
  FilterToolbar,
  PaginationBar,
  SearchInput,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { STOCK_RESERVATION_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { formatReceiptNumber } from "@/components/sales/sales-shared";


export default function SalesReservationsPage() {
  const [rows, setRows] = useState([]);
  const [salesById, setSalesById] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(25);

  const loadData = useCallback(async () => {
    try {
      const res = await apiRequest("/stock-reservations", {
        searchParams: { per_page: 200 },
      });
      const active = (res.data ?? []).filter((r) => !r.released_at);
      setRows(active);

      const saleIds = [...new Set(active.map((r) => r.sale_id).filter(Boolean))];
      if (saleIds.length) {
        const salesRes = await apiRequest("/sales", { searchParams: { per_page: 200 } });
        const map = {};
        for (const s of salesRes.data ?? []) {
          if (saleIds.includes(s.id)) map[s.id] = s;
        }
        setSalesById(map);
      }
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load reservations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const sale = salesById[r.sale_id];
      const receipt = sale ? formatReceiptNumber(sale).toLowerCase() : "";
      return (
        String(r.product_name ?? "").toLowerCase().includes(q) ||
        String(r.product_code).toLowerCase().includes(q) ||
        receipt.includes(q) ||
        String(r.sale_id ?? "").includes(q)
      );
    });
  }, [rows, search, salesById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handlePageSizeChange = useCallback(
    (size) => {
      setPageSize(size);
      setPage(1);
    },
    [setPageSize],
  );

  useEffect(() => {
    setPage(1);
  }, [search]);

  return (
    <CatalogPageShell
      title="Reserved stock"
      subtitle="Stock held for open carts and pending orders"
      action={
        <CatalogListExport
          title="Stock reservations"
          filename="stock-reservations"
          apiPath="/stock-reservations"
          columns={STOCK_RESERVATION_EXPORT_COLUMNS}
          totalCount={filtered.length}
          getSearchParams={() => ({ per_page: 200 })}
          disabled={loading}
        />
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
        {loading ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">Loading reservations…</p>
        ) : pageSlice.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No active reservations.</p>
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
              {pageSlice.map((row) => {
                const sale = salesById[row.sale_id];
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
              })}
            </tbody>
          </table>
        )}
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={pageSize}
          onChange={setPage}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>
    </CatalogPageShell>
  );
}
