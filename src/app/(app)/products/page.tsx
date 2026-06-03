"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import type { Paginated, Product } from "@/types/api";

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiRequest<Paginated<Product>>("/products", { searchParams: { per_page: 50 } })
      .then((res) => setProducts(res.data ?? []))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-white">Products</h1>
      <p className="mt-1 text-sm text-slate-400">From GET /products</p>

      {loading && <p className="mt-6 text-slate-500">Loading…</p>}
      {error && (
        <p className="mt-6 rounded-lg bg-red-950/40 px-3 py-2 text-sm text-red-300">
          {error}
        </p>
      )}

      {!loading && !error && (
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-800">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">Shop</th>
                <th className="px-4 py-3 text-right">Store</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {products.map((p) => (
                <tr key={p.product_code} className="bg-slate-900/40">
                  <td className="px-4 py-3 font-mono text-xs text-emerald-300">
                    {p.product_code}
                  </td>
                  <td className="px-4 py-3 text-slate-200">{p.product_name}</td>
                  <td className="px-4 py-3 text-right text-slate-300">
                    {p.unit_price}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    {p.stock_in_shop ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    {p.stock_in_store ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
