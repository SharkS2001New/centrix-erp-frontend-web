"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import {
  CatalogPageShell,
  PaginationBar,
  SearchInput,
  formatShortDate,
} from "@/components/catalog/catalog-shared";
import { formatReceiptNumber, formatSaleKes } from "@/components/sales/sales-shared";

const PAGE_SIZE = 15;

const SUPPLIER_RETURN_TYPES = new Set(["SUPPLIER"]);

export default function SalesReturnsPage() {
  const [rows, setRows] = useState([]);
  const [salesById, setSalesById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const loadData = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest("/returns", { searchParams: { per_page: 200 } });
      const customerReturns = (res.data ?? []).filter(
        (r) => !SUPPLIER_RETURN_TYPES.has(String(r.return_type ?? "").toUpperCase()),
      );
      setRows(customerReturns);

      const saleIds = [...new Set(customerReturns.map((r) => r.sale_id).filter(Boolean))];
      if (saleIds.length) {
        const salesRes = await apiRequest("/sales", { searchParams: { per_page: 200 } });
        const map = {};
        for (const s of salesRes.data ?? []) {
          if (saleIds.includes(s.id)) map[s.id] = s;
        }
        setSalesById(map);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load returns");
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
        receipt.includes(q) ||
        String(r.product_code ?? "").toLowerCase().includes(q) ||
        String(r.reason ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, search, salesById]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <CatalogPageShell
      title="Sales returns"
      subtitle="Customer returns linked to sales receipts"
      toolbar={
        <div className="mb-4">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search receipt, product, reason…"
            className="max-w-md"
          />
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
          <p className="px-5 py-8 text-center text-sm text-slate-500">Loading returns…</p>
        ) : pageSlice.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">No sales returns recorded.</p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                <th className="px-4 py-2.5">Receipt</th>
                <th className="px-4 py-2.5">Product</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Reason</th>
                <th className="px-4 py-2.5">Date</th>
              </tr>
            </thead>
            <tbody>
              {pageSlice.map((row) => {
                const sale = salesById[row.sale_id];
                return (
                  <tr key={row.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="px-4 py-3">
                      {sale ? (
                        <Link
                          href={`/sales/orders/${sale.id}`}
                          className="font-medium text-[#185FA5] hover:underline"
                        >
                          {formatReceiptNumber(sale)}
                        </Link>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-800">{row.product_code ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">
                      {formatSaleKes(row.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{row.reason ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{formatShortDate(row.created_at)}</td>
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
          pageSize={PAGE_SIZE}
          onChange={setPage}
        />
      </div>
    </CatalogPageShell>
  );
}
