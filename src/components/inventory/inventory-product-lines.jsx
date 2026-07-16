"use client";

import { useMemo, useState } from "react";
import { inputClassName } from "@/components/catalog/catalog-shared";
import { LpoProductSearchPanel } from "@/components/lpo/lpo-product-search-panel";
import { lineFromEnrichedProduct } from "@/components/lpo/lpo-product-utils";

/**
 * LPO-style product search + lines table for inventory forms.
 */
export function InventoryProductLines({
  lines,
  onChange,
  uomById,
  vatById = new Map(),
  branchId = null,
  renderCells,
  tableHeaders,
  emptyMessage = "No items added yet.",
  onAddProduct,
  onAddProducts,
}) {
  const [selectedIndex, setSelectedIndex] = useState(null);

  function addProduct(product) {
    if (onAddProduct) {
      onAddProduct(product);
      return;
    }
    const code = product.product_code;
    const existingIndex = lines.findIndex((l) => l.product_code === code);
    if (existingIndex >= 0) {
      setSelectedIndex(existingIndex);
      return;
    }
    const row = lineFromEnrichedProduct(product);
    onChange([...lines, row]);
    setSelectedIndex(lines.length);
  }

  function addProducts(products) {
    if (!products?.length) return;
    if (onAddProducts) {
      onAddProducts(products);
      return;
    }
    let lastIndex = selectedIndex;
    let nextLines = [...lines];
    for (const product of products) {
      if (onAddProduct) {
        onAddProduct(product);
        continue;
      }
      const code = product.product_code;
      const existingIndex = nextLines.findIndex((l) => l.product_code === code);
      if (existingIndex >= 0) {
        lastIndex = existingIndex;
        continue;
      }
      nextLines = [...nextLines, lineFromEnrichedProduct(product)];
      lastIndex = nextLines.length - 1;
    }
    if (!onAddProduct) {
      onChange(nextLines);
      if (lastIndex != null) setSelectedIndex(lastIndex);
    }
  }

  function updateLine(index, patch) {
    onChange(lines.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function removeSelected() {
    if (selectedIndex == null) return;
    onChange(lines.filter((_, i) => i !== selectedIndex));
    setSelectedIndex(null);
  }

  const colCount = tableHeaders.length;

  return (
    <div className="flex min-h-[420px] flex-col gap-4 lg:flex-row">
      <div className="flex w-full shrink-0 flex-col lg:w-[40%] lg:border-r lg:border-slate-200 lg:pr-4">
        <LpoProductSearchPanel
          uomById={uomById}
          vatById={vatById}
          branchId={branchId}
          selectionMode="multiple"
          onSelect={addProduct}
          onSelectMany={addProducts}
          actionLabel="Add to list"
          multiActionLabel="Add {n} to list"
          hint="Search products, tick rows, then Add to list."
          clearOnSelect
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Items</h3>
          <button
            type="button"
            onClick={removeSelected}
            disabled={selectedIndex == null}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Remove selected
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="max-h-[400px] overflow-auto">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {tableHeaders.map((h) => (
                    <th key={h.key} className={`px-3 py-2 ${h.align === "right" ? "text-right" : ""}`}>
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} className="px-3 py-10 text-center text-slate-500">
                      {emptyMessage}
                    </td>
                  </tr>
                ) : (
                  lines.map((line, index) => (
                    <tr
                      key={`${line.product_code}-${index}`}
                      onClick={() => setSelectedIndex(index)}
                      className={`cursor-pointer border-b border-slate-100 ${
                        selectedIndex === index ? "bg-[#E6F1FB]/50" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-3 py-2">
                        <span className="font-medium text-slate-900">{line.product_name}</span>
                        <span className="block font-mono text-[10px] text-slate-500">
                          {line.product_code}
                        </span>
                      </td>
                      {renderCells(line, index, updateLine)}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function useInventoryCatalogMaps(uoms, vats = []) {
  const uomById = useMemo(() => new Map(uoms.map((u) => [u.id, u])), [uoms]);
  const vatById = useMemo(() => new Map(vats.map((v) => [v.id, v])), [vats]);
  return { uomById, vatById };
}
