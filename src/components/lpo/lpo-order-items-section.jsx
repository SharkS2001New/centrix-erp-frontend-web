"use client";

import { useMemo, useState } from "react";
import { inputClassName } from "@/components/catalog/catalog-shared";
import {
  formatPackQtyString,
  lineFromEnrichedProduct,
  orderCountsObjectFromPackQty,
  orderCountsToPackQty,
} from "./lpo-product-utils";
import { LpoProductSearchPanel } from "./lpo-product-search-panel";
import {
  computeLpoLineTotals,
  computeLpoTotals,
  formatLpoAmount,
  formatLpoKes,
  sanitizeLpoWholeNumber,
} from "./lpo-shared";
import { StockTakeCountInputs } from "@/components/inventory/stock-take-count-inputs";
import { uomStockTakeLevels } from "@/lib/uom-packaging";
import { useConfirm } from "@/lib/use-confirm";

export function LpoOrderItemsSection({
  lines,
  onChange,
  uomById,
  vatById,
  readOnly = false,
}) {
  const confirm = useConfirm();
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

  async function clearAllLines() {
    if (!lines.length) return;
    const ok = await confirm({
      title: "Remove all items",
      message: "Remove all items from this purchase order?",
      confirmLabel: "Remove all",
      destructive: true,
    });
    if (!ok) return;
    onChange([]);
    setSelectedLineIndex(null);
  }

  function updateOrderCount(index, levelKey, value) {
    const line = lines[index];
    const uom = uomById.get(line.unit_id);
    const order_counts = { ...(line.order_counts ?? {}), [levelKey]: value };
    const packQty = orderCountsToPackQty(order_counts, uom);
    updateLine(index, {
      order_counts,
      ordered_qty: formatPackQtyString(packQty),
    });
  }

  function addProduct(product) {
    addProducts([product]);
  }

  function addProducts(products) {
    if (!products.length) return;

    let nextLines = [...lines];
    let lastIndex = selectedLineIndex;

    for (const product of products) {
      const code = product.product_code;
      const existingIndex = nextLines.findIndex((l) => l.product_code === code);
      if (existingIndex >= 0) {
        const row = nextLines[existingIndex];
        const uom = uomById.get(row.unit_id) ?? product.uom;
        const counts = {
          ...(row.order_counts ??
            orderCountsObjectFromPackQty(Number(row.ordered_qty) || 0, uom)),
        };
        const primaryKey = uomStockTakeLevels(uom)[0]?.key ?? "full";
        counts[primaryKey] = String((Number(counts[primaryKey]) || 0) + 1);
        const packQty = orderCountsToPackQty(counts, uom);
        nextLines[existingIndex] = {
          ...row,
          order_counts: counts,
          ordered_qty: formatPackQtyString(packQty),
        };
        lastIndex = existingIndex;
        continue;
      }

      nextLines = [...nextLines, lineFromEnrichedProduct(product)];
      lastIndex = nextLines.length - 1;
    }

    onChange(nextLines);
    setSelectedLineIndex(lastIndex);
  }

  return (
    <div className="flex min-h-[520px] flex-col gap-4 lg:flex-row">
      {!readOnly ? (
        <div className="flex w-full shrink-0 flex-col border-slate-200 lg:w-[42%] lg:border-r lg:pr-4">
          <LpoProductSearchPanel
            uomById={uomById}
            vatById={vatById}
            onSelect={addProduct}
            onSelectMany={addProducts}
            selectionMode="multiple"
            hint="Select one or more products, then add them to the order. Double-click a row to add it immediately."
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
            <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[26%]" />
                <col className="w-[16%]" />
                <col className="w-[20%]" />
                <col className="w-[14%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
              </colgroup>
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr className="text-left text-xs font-semibold text-slate-600">
                  <th className="px-2 py-2">Product name</th>
                  <th className="px-2 py-2">Packaging</th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">
                    <span className="block">Qty to order</span>
                    <span className="block font-normal text-slate-500">(by packaging level)</span>
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">
                    <span className="block">Cost price</span>
                    <span className="block font-normal text-slate-500">(Supplier selling price)</span>
                  </th>
                  <th className="whitespace-nowrap px-2 py-2 text-right">
                    <span className="block">Amount</span>
                    <span className="block font-normal text-slate-500">(Before VAT)</span>
                  </th>
                  <th className="px-2 py-2 text-right">VAT</th>
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-12 text-center text-slate-500">
                      No items in this order yet.
                    </td>
                  </tr>
                ) : (
                  lines.map((line, index) => {
                    const uom = uomById.get(line.unit_id);
                    const { net, vat } = computeLpoLineTotals(line);
                    const rowSelected = selectedLineIndex === index;
                    const countsFlat = {};
                    const orderCounts =
                      line.order_counts ??
                      (uom
                        ? orderCountsObjectFromPackQty(Number(line.ordered_qty) || 0, uom)
                        : null);
                    if (orderCounts) {
                      for (const [k, v] of Object.entries(orderCounts)) {
                        countsFlat[`${index}:${k}`] = v;
                      }
                    }
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
                        <td className="px-2 py-2 align-middle text-xs leading-snug text-slate-700">
                          {(line.packaging_label || line.uom || "—")
                            .split(" · ")
                            .map((part) => part.trim())
                            .filter(Boolean)
                            .map((part, i) => (
                              <span key={i} className="block">
                                {part}
                              </span>
                            ))}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {uom ? (
                            <div onClick={(e) => e.stopPropagation()}>
                              <StockTakeCountInputs
                                lineId={String(index)}
                                uom={uom}
                                counts={countsFlat}
                                onChange={(key, value) => {
                                  const levelKey = key.split(":")[1];
                                  updateOrderCount(index, levelKey, value);
                                }}
                                disabled={readOnly}
                                showPreview
                              />
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right align-middle">
                          <input
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            className={`${inputClassName()} w-24 shrink-0 text-right`}
                            value={line.cost_price}
                            onChange={(e) =>
                              updateLine(index, {
                                cost_price: sanitizeLpoWholeNumber(e.target.value),
                              })
                            }
                            onClick={(e) => e.stopPropagation()}
                            readOnly={readOnly}
                            title="Supplier selling price per full package — updates product last cost when PO is saved"
                          />
                        </td>
                        <td className="px-2 py-2 text-right align-middle font-medium tabular-nums text-slate-900">
                          {formatLpoAmount(net)}
                        </td>
                        <td className="px-2 py-2 text-right align-middle tabular-nums text-slate-700">
                          {vat > 0 ? formatLpoAmount(vat) : "—"}
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
            Enter quantity at each packaging level from UOM settings (e.g. bags, outers, kg).
            Cost is per full package. VAT from the product catalog.
          </p>
          <div className="text-right">
            <p className="text-xs text-slate-500">
              Subtotal (Before VAT) {formatLpoKes(totals.subtotal)} · VAT {formatLpoKes(totals.vat)}
            </p>
            <p className="text-lg font-bold text-slate-900">TOTAL: {formatLpoKes(totals.total)}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
