"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { formatOrderNumber, formatSaleKes } from "@/lib/sales";
import { saleLineDisplayUnitPrice } from "@/lib/sale-line-items";
import { inputClassName, PrimaryButton } from "@/components/catalog/catalog-shared";
import { posModalOverlayClass, posModalPanelClass, renderPosModalPortal } from "@/lib/pos-modal-shell";

function lineLabel(line) {
  const code = line?.product_code ?? line?.product?.product_code ?? "";
  const name = line?.product?.product_name ?? line?.description ?? "";
  if (name && code) return `${name} (${code})`;
  return name || code || "Item";
}

function scaleAmount(value, newQty, oldQty) {
  const old = Number(oldQty);
  if (!old || old <= 0) return 0;
  return Math.round((Number(value) * Number(newQty)) / old * 100) / 100;
}

export function BackofficeOrderEditModal({ open, sale, uomById, onClose, onSaved }) {
  const [lines, setLines] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const loadItems = useCallback(async () => {
    if (!sale?.id) return;
    setLoading(true);
    setError(null);
    try {
      const detail = sale.items?.length
        ? sale
        : await apiRequest(`/sales/${sale.id}`);
      setLines(
        (detail.items ?? []).map((line) => ({
          id: line.id,
          product_code: line.product_code,
          product: line.product,
          quantity: Number(line.quantity ?? 0),
          draftQty: String(line.quantity ?? ""),
          selling_price: Number(line.selling_price ?? 0),
          amount: Number(line.amount ?? 0),
          product_vat: Number(line.product_vat ?? 0),
          discount_given: Number(line.discount_given ?? 0),
          uom: line.uom,
          on_wholesale_retail: line.on_wholesale_retail,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load order lines.");
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [sale]);

  useEffect(() => {
    if (!open || !sale?.id) {
      setLines([]);
      setError(null);
      return;
    }
    void loadItems();
  }, [open, sale?.id, loadItems]);

  const totals = useMemo(() => {
    return lines.reduce((sum, line) => {
      const oldQty = Number(line.quantity);
      const draftQty = Number(line.draftQty);
      const qty = Number.isFinite(draftQty) && draftQty > 0 ? draftQty : oldQty;
      return sum + scaleAmount(line.amount, qty, oldQty || qty);
    }, 0);
  }, [lines]);

  function updateQty(lineId, value) {
    setLines((prev) =>
      prev.map((line) => (line.id === lineId ? { ...line, draftQty: value } : line)),
    );
  }

  async function handleSave() {
    if (!sale?.id) return;
    const payload = [];
    for (const line of lines) {
      const qty = Number(line.draftQty ?? line.quantity);
      if (!Number.isFinite(qty) || qty <= 0) {
        setError("Each line needs a quantity greater than zero.");
        return;
      }
      payload.push({ id: line.id, quantity: qty });
    }

    setSaving(true);
    setError(null);
    try {
      const updated = await apiRequest(`/sales/orders/${sale.id}/line-quantities`, {
        method: "PATCH",
        body: { items: payload },
      });
      onSaved?.(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not save changes.");
    } finally {
      setSaving(false);
    }
  }

  if (!open || !sale?.id) return null;

  return renderPosModalPortal(
    <div className={posModalOverlayClass(false, "z-50")} role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden />
      <div
        className={posModalPanelClass(
          false,
          "theme-panel flex w-[min(96vw,720px)] flex-col overflow-hidden rounded-xl border shadow-2xl",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backoffice-order-edit-title"
      >
        <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 id="backoffice-order-edit-title" className="theme-heading text-base font-semibold">
              Edit order {formatOrderNumber(sale)}
            </h2>
            <p className="theme-subtext mt-0.5 text-xs">Adjust quantities and save.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
        </div>

        <div className="max-h-[min(60vh,480px)] overflow-auto px-5 py-4">
          {loading ? (
            <p className="theme-subtext py-8 text-center text-sm">Loading order lines…</p>
          ) : lines.length === 0 ? (
            <p className="theme-subtext py-8 text-center text-sm">No line items on this order.</p>
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="theme-table-head border-b text-left text-xs font-medium uppercase tracking-wide">
                  <th className="px-3 py-2">Item</th>
                  <th className="w-28 px-3 py-2 text-right">Qty</th>
                  <th className="w-32 px-3 py-2 text-right">Unit price</th>
                  <th className="w-32 px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => {
                  const oldQty = Number(line.quantity);
                  const draftQty = line.draftQty ?? String(oldQty);
                  const qtyNum = Number(draftQty);
                  const displayQty = Number.isFinite(qtyNum) && qtyNum > 0 ? qtyNum : oldQty;
                  const amount = scaleAmount(line.amount, displayQty, oldQty || displayQty);
                  const unitPrice = saleLineDisplayUnitPrice(line, uomById);

                  return (
                    <tr key={line.id} className="theme-table-row border-b last:border-b-0">
                      <td className="px-3 py-2.5 text-slate-800">{lineLabel(line)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <input
                          type="number"
                          min="0.0001"
                          step="any"
                          value={draftQty}
                          disabled={saving}
                          onChange={(e) => updateQty(line.id, e.target.value)}
                          className={`${inputClassName()} w-24 text-right text-sm`}
                          aria-label={`Quantity for ${lineLabel(line)}`}
                        />
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-700">
                        {formatSaleKes(unitPrice)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-900">
                        {formatSaleKes(amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t px-5 py-4">
          <div className="text-sm text-slate-600">
            Order total: <span className="font-semibold text-slate-900">{formatSaleKes(totals)}</span>
          </div>
          <div className="flex items-center gap-2">
            {error ? (
              <p className="max-w-xs text-right text-sm text-red-600" role="alert">
                {error}
              </p>
            ) : null}
            <PrimaryButton type="button" showIcon={false} disabled={saving || loading || !lines.length} onClick={() => void handleSave()}>
              {saving ? "Saving…" : "Save"}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>,
  );
}
