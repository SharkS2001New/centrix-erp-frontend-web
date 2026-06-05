"use client";

import { useMemo, useState } from "react";
import { inputClassName } from "@/components/catalog/catalog-shared";
import { lineFromEnrichedProduct } from "./lpo-product-utils";
import { LpoProductSearchPanel } from "./lpo-product-search-panel";
import {
  computeLpoTotals,
  formatLpoAmount,
  formatLpoKes,
  sanitizeLpoOrderQty,
  sanitizeLpoWholeNumber,
} from "./lpo-shared";

export function LpoOrderItemsSection({
  lines,
  onChange,
  uomById,
  vatById,
  readOnly = false,
}) {
  const [selectedLineIndex, setSelectedLineIndex] = useState(null);

  const totals = useMemo(() => computeLpoTotals(lines), [lines]);

  function updateLine(index, patch) {
    onChange(lines.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeSelectedLine() {
    if (selectedLineIndex == null) return;
    onChange(lines.filter((_, i) => i !== selectedLineIndex));
    setSelectedLineIndex(null);
  }

  function clearAllLines() {
    if (!lines.length) return;
    if (!confirm("Remove all items from this purchase order?")) return;
    onChange([]);
    setSelectedLineIndex(null);
  }

  function addProduct(product) {
    const code = product.product_code;
    const existingIndex = lines.findIndex((l) => l.product_code === code);
    if (existingIndex >= 0) {
      const row = lines[existingIndex];
      const qty = Number(row.ordered_qty) || 0;
      updateLine(existingIndex, { ordered_qty: String(qty + 1) });
      setSelectedLineIndex(existingIndex);
      return;
    }
    onChange([...lines, lineFromEnrichedProduct(product)]);
    setSelectedLineIndex(lines.length);
  }

  return (
    <div className="flex min-h-[520px] flex-col gap-4 lg:flex-row">
      {!readOnly ? (
        <div className="flex w-full shrink-0 flex-col border-slate-200 lg:w-[42%] lg:border-r lg:pr-4">
          <LpoProductSearchPanel
            uomById={uomById}
            vatById={vatById}
            onSelect={addProduct}
          />
        </div>
      ) : null}

      <div className={`flex min-w-0 flex-1 flex-col ${readOnly ? "w-full" : ""}`}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Order items</h3>
          {!readOnly ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={removeSelectedLine}
                disabled={selectedLineIndex == null}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                title="Remove selected line"
              >
                − Remove
              </button>
              <button
                type="button"
                onClick={clearAllLines}
                disabled={!lines.length}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                title="Clear all lines"
              >
                Clear all
              </button>
            </div>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-300 bg-white">
          <div className="max-h-[380px] overflow-auto">
            <table className="w-full min-w-[640px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[41%]" />
                <col className="w-[18%]" />
                <col className="w-[12%]" />
                <col className="w-[14%]" />
                <col className="w-[15%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr className="text-left text-xs font-semibold text-slate-600">
                  <th className="px-2 py-2">Product name</th>
                  <th className="whitespace-nowrap px-2 py-2">
                    <span className="block">Packaging</span>
                    <span className="block font-normal text-slate-500">(Units per package)</span>
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">
                    <span className="block">Qty to order</span>
                    <span className="block font-normal text-slate-500">(in packs, decimals OK)</span>
                  </th>
                  <th className="px-2 py-2 text-right">
                    <span className="block">Cost price</span>
                    <span className="font-normal text-slate-500">(per pack)</span>
                  </th>
                  <th className="px-3 py-2 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-12 text-center text-slate-500">
                      No items in this order yet.
                    </td>
                  </tr>
                ) : (
                  lines.map((line, index) => {
                    const amount =
                      (Number(line.ordered_qty) || 0) * (Number(line.cost_price) || 0);
                    const rowSelected = selectedLineIndex === index;
                    return (
                      <tr
                        key={`${line.product_code}-${index}`}
                        onClick={() => setSelectedLineIndex(index)}
                        className={`cursor-pointer border-b border-slate-100 ${
                          rowSelected ? "bg-[#E6F1FB]/50" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-2 py-2">
                          <span className="font-medium text-slate-900">{line.product_name}</span>
                          <span className="block font-mono text-[10px] text-slate-500">
                            {line.product_code}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-xs text-slate-700">
                          {line.packaging_label || line.uom || "—"}
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="any"
                            inputMode="decimal"
                            className={`${inputClassName()} w-20 text-right`}
                            value={line.ordered_qty}
                            onChange={(e) =>
                              updateLine(index, {
                                ordered_qty: sanitizeLpoOrderQty(e.target.value),
                              })
                            }
                            onClick={(e) => e.stopPropagation()}
                            readOnly={readOnly}
                            title="Packs to order — use 1.5 for one and a half cartons, etc."
                          />
                        </td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            className={`${inputClassName()} w-24 text-right`}
                            value={line.cost_price}
                            onChange={(e) =>
                              updateLine(index, {
                                cost_price: sanitizeLpoWholeNumber(e.target.value),
                              })
                            }
                            onClick={(e) => e.stopPropagation()}
                            readOnly={readOnly}
                            title="Cost per package — updates product last cost when PO is saved"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-medium tabular-nums text-slate-900">
                          {formatLpoAmount(amount)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-3 flex items-end justify-between gap-4 border-t border-slate-200 pt-3">
          <p className="text-xs text-slate-500">
            Qty is in packs — enter decimals for part packs (e.g. 1.5 = one and a half cartons).
            Packaging shows units per pack (e.g. Carton (20)). Cost is a whole number per pack. VAT
            from the product catalog.
          </p>
          <div className="text-right">
            <p className="text-xs text-slate-500">
              Subtotal {formatLpoKes(totals.subtotal)} · VAT {formatLpoKes(totals.vat)}
            </p>
            <p className="text-lg font-bold text-slate-900">TOTAL: {formatLpoKes(totals.total)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
