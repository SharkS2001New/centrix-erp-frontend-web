"use client";

import { FormEvent, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";

type Availability = {
  on_hand: number;
  reserved: number;
  available: number;
};

export default function InventoryPage() {
  const { user } = useAuth();
  const [productCode, setProductCode] = useState("6161100100015");
  const [result, setResult] = useState<Availability | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkStock(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const data = await apiRequest<Availability>("/inventory/availability", {
        searchParams: {
          product_code: productCode,
          branch_id: user?.branch_id ?? 1,
          location: "shop",
        },
      });
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
      setResult(null);
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-2xl font-semibold text-white">Inventory</h1>
      <p className="mt-1 text-sm text-slate-400">GET /inventory/availability</p>

      <form onSubmit={checkStock} className="mt-6 space-y-3">
        <input
          className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm"
          value={productCode}
          onChange={(e) => setProductCode(e.target.value)}
          placeholder="Product code"
        />
        <button
          type="submit"
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
        >
          Check availability
        </button>
      </form>

      {error && (
        <p className="mt-4 text-sm text-red-300">{error}</p>
      )}

      {result && (
        <dl className="mt-6 grid grid-cols-3 gap-3">
          {(
            [
              ["On hand", result.on_hand],
              ["Reserved", result.reserved],
              ["Available", result.available],
            ] as const
          ).map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-center"
            >
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-1 text-xl font-semibold text-white">{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
