"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  Field,
  PaginationBar,
  PrimaryLink,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { P } from "@/lib/permission-codes";
import {
  defaultDateRange,
  formatMovementDateTime,
  formatStockQty,
  InventoryPageShell,
  InventoryTableShell,
  movementLocationLabel,
  ProductCodeLink,
  rowInDateRange,
} from "@/components/inventory/inventory-shared";

const PAGE_SIZE = 15;

export default function StockAdjustmentsPage() {
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;
  const initialRange = defaultDateRange(30);

  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const all = [];
      let pageNum = 1;
      let lastPage = 1;
      do {
        const res = await apiRequest("/inventory-transactions", {
          searchParams: {
            per_page: 200,
            page: pageNum,
            "filter[branch_id]": branchId,
            "filter[transaction_type]": "ADJUSTMENT",
            "filter[reference_type]": "adjustment",
          },
        });
        all.push(...(res.data ?? []));
        lastPage = res.last_page ?? 1;
        pageNum += 1;
      } while (pageNum <= lastPage);
      setRows(all);

      const [prodRes, uomRes] = await Promise.all([
        apiRequest("/products", { searchParams: { per_page: 500, branch_id: branchId } }),
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
      ]);
      setProducts(prodRes.data ?? []);
      setUoms(uomRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load adjustments");
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const uomByProduct = useMemo(() => {
    const uomById = new Map(uoms.map((u) => [u.id, u]));
    const map = new Map();
    for (const p of products) {
      map.set(p.product_code, uomById.get(p.unit_id));
    }
    return map;
  }, [products, uoms]);

  const productByCode = useMemo(
    () => new Map(products.map((p) => [p.product_code, p])),
    [products],
  );

  const filtered = useMemo(
    () => rows.filter((row) => rowInDateRange(row, fromDate, toDate, ["created_at"])),
    [rows, fromDate, toDate],
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [fromDate, toDate]);

  return (
    <InventoryPageShell
      title="Stock adjustments"
      subtitle="Manual increases and decreases to shop or store stock"
      action={
        <PrimaryLink href="/inventory/adjustments/new" permission={P.inventory.adjustments.create}>
          Adjust stock
        </PrimaryLink>
      }
    >
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
        <p className="pb-2 text-xs text-slate-500">
          {filtered.length} adjustment{filtered.length === 1 ? "" : "s"} in range
        </p>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <InventoryTableShell>
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading adjustments…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Date</th>
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium text-right">Change</th>
                    <th className="px-4 py-3 font-medium">Location</th>
                    <th className="px-4 py-3 font-medium text-right">Before</th>
                    <th className="px-4 py-3 font-medium text-right">After</th>
                    <th className="px-4 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                        No adjustments in this date range.{" "}
                        <Link href="/inventory/adjustments/new" className="text-[#185FA5] hover:underline">
                          Record one
                        </Link>
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((row) => {
                      const product = productByCode.get(row.product_code);
                      const change = Number(row.quantity_change ?? 0);
                      const uom = uomByProduct.get(row.product_code);
                      return (
                        <tr key={row.id} className="border-b border-slate-100">
                          <td className="px-4 py-3 text-slate-600">
                            {row.created_at ? formatMovementDateTime(row.created_at) : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-slate-900">
                              {product?.product_name ?? row.product_code}
                            </span>
                            <div className="mt-0.5">
                              <ProductCodeLink code={row.product_code} />
                            </div>
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums font-medium ${
                              change > 0 ? "text-emerald-700" : "text-red-700"
                            }`}
                          >
                            {change > 0 ? "+" : "−"}
                            {formatStockQty(Math.abs(change), uom)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {movementLocationLabel(row.stock_location)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {formatStockQty(row.quantity_before, uom)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                            {formatStockQty(row.quantity_after, uom)}
                          </td>
                          <td className="px-4 py-3 text-slate-600">{row.notes ?? "—"}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            <PaginationBar
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
          </>
        )}
      </InventoryTableShell>
    </InventoryPageShell>
  );
}
