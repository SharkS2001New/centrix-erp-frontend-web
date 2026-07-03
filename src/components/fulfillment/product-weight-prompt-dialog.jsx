"use client";

import { useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";

function formatKg(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 3 })} kg`;
}

export function ProductWeightPromptDialog({
  open,
  sale,
  targetStatus,
  products = [],
  onClose,
  onSaved,
  busy = false,
}) {
  const [weights, setWeights] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const initial = {};
    for (const row of products) {
      initial[row.product_code] =
        row.product_weight != null && Number(row.product_weight) > 0
          ? String(row.product_weight)
          : "";
    }
    setWeights(initial);
    setError("");
  }, [open, products]);

  const previewTonnage = useMemo(() => {
    let total = 0;
    for (const row of products) {
      const unit = Number(weights[row.product_code]);
      if (!Number.isFinite(unit) || unit <= 0) continue;
      total += unit * Number(row.quantity || 0);
    }
    return total;
  }, [products, weights]);

  const allValid = useMemo(
    () =>
      products.length > 0
      && products.every((row) => {
        const unit = Number(weights[row.product_code]);
        return Number.isFinite(unit) && unit > 0;
      }),
    [products, weights],
  );

  if (!open) return null;

  async function handleSave() {
    if (!sale?.id || !allValid) return;
    setSaving(true);
    setError("");
    try {
      const payload = {
        weights: products.map((row) => ({
          product_code: row.product_code,
          product_weight: Number(weights[row.product_code]),
        })),
      };
      const result = await apiRequest(`/sales/orders/${sale.id}/product-weights`, {
        method: "POST",
        body: payload,
      });
      await onSaved?.(result, sale, targetStatus);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save product weights.");
    } finally {
      setSaving(false);
    }
  }

  const isBusy = busy || saving;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="theme-panel max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl border p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-weight-prompt-title"
      >
        <h2 id="product-weight-prompt-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Set product weights
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Order #{sale?.order_num ?? sale?.id} needs weight on each product before tonnage can be calculated
          {targetStatus ? ` and the order can move to ${targetStatus}.` : "."}
        </p>

        <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500 dark:bg-slate-900/40">
              <tr>
                <th className="px-3 py-2">Product</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2">Weight per unit (kg)</th>
                <th className="px-3 py-2 text-right">Line weight</th>
              </tr>
            </thead>
            <tbody>
              {products.map((row) => {
                const unit = Number(weights[row.product_code]);
                const lineWeight =
                  Number.isFinite(unit) && unit > 0
                    ? unit * Number(row.quantity || 0)
                    : null;

                return (
                  <tr key={row.product_code} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900 dark:text-slate-100">{row.product_name}</div>
                      <div className="text-xs text-slate-500">{row.product_code}</div>
                    </td>
                    <td className="px-3 py-2 text-right">{row.quantity}</td>
                    <td className="px-3 py-2">
                      <input
                        type="number"
                        min="0.001"
                        step="any"
                        className={`${inputClassName()} w-32`}
                        value={weights[row.product_code] ?? ""}
                        onChange={(e) =>
                          setWeights((prev) => ({ ...prev, [row.product_code]: e.target.value }))
                        }
                        placeholder="e.g. 0.5"
                      />
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">
                      {lineWeight != null ? formatKg(lineWeight) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          Estimated order tonnage: <span className="font-medium">{formatKg(previewTonnage)}</span>
        </p>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200"
            onClick={onClose}
            disabled={isBusy}
          >
            Cancel
          </button>
          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={isBusy || !allValid}
            onClick={() => void handleSave()}
          >
            {isBusy ? "Saving…" : "Save weights & continue"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
