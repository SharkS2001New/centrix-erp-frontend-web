"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  formatReceiptDate,
  formatStockQty,
  InventoryPageShell,
  InventoryTableShell,
  ProductCodeLink,
} from "@/components/inventory/inventory-shared";

export default function StockReceiptDetailPage() {
  const params = useParams();
  const ref = decodeURIComponent(params.ref);
  const { user } = useAuth();
  const branchId = user?.branch_id ?? 1;

  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [uoms, setUoms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const isSingleId = ref.startsWith("RCPT-");
      const [receiptRes, prodRes, uomRes] = await Promise.all([
        isSingleId
          ? apiRequest(`/stock-receipts/${ref.replace("RCPT-", "")}`)
          : apiRequest("/stock-receipts", {
              searchParams: {
                per_page: 200,
                "filter[branch_id]": branchId,
                "filter[invoice_number]": ref,
              },
            }),
        apiRequest("/products", { searchParams: { per_page: 500 } }),
        apiRequest("/uoms", { searchParams: { per_page: 200 } }),
      ]);
      const filtered = isSingleId
        ? [receiptRes]
        : (receiptRes.data ?? []).filter(
            (row) => (row.invoice_number ?? "").trim() === ref,
          );
      setRows(filtered);
      setProducts(prodRes.data ?? []);
      setUoms(uomRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load receipt");
    } finally {
      setLoading(false);
    }
  }, [branchId, ref]);

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

  const header = rows[0];
  const receiptDate = header?.created_at ?? header?.receipt_date;

  return (
    <InventoryPageShell title={ref} subtitle="Stock receipt details">
      <div className="mb-4">
        <Link href="/inventory/receipts" className="text-sm text-[#185FA5] hover:underline">
          ← Back to stock receipts
        </Link>
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500">Loading receipt…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Receipt not found.</p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <dl className="grid gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-slate-500">Date</dt>
                <dd className="font-medium">{formatReceiptDate(receiptDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Items</dt>
                <dd className="font-medium">{rows.length}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">Location</dt>
                <dd className="font-medium capitalize">{header.stock_location}</dd>
              </div>
            </dl>
          </div>

          <InventoryTableShell>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-4 py-3 font-medium">Product</th>
                    <th className="px-4 py-3 font-medium text-right">Qty received</th>
                    <th className="px-4 py-3 font-medium text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const product = productByCode.get(row.product_code);
                    return (
                      <tr key={row.id} className="border-b border-slate-100">
                        <td className="px-4 py-3">
                          <span className="font-medium text-slate-900">
                            {product?.product_name ?? row.product_code}
                          </span>
                          <div className="mt-0.5">
                            <ProductCodeLink code={row.product_code} />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {formatStockQty(row.units_received, uomByProduct.get(row.product_code))}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">
                          {row.cost_price != null ? `KES ${Number(row.cost_price).toLocaleString("en-KE")}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </InventoryTableShell>
        </div>
      )}
    </InventoryPageShell>
  );
}
