"use client";

import { useState } from "react";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  AdjustStockGuideModal,
  AdjustStockGuideTrigger,
} from "@/components/products/adjust-stock-guide-modal";
import {
  fullPackageLabel,
  smallPackagingLabel,
  uomConversionSummary,
  uomHasFullPack,
  uomStockTakeLevels,
} from "@/lib/uom-packaging";
import {
  baseToDisplayQty,
  baseToHierarchyCounts,
  formatMixedStockDisplay,
  stockTakeCountsToBase,
  uomConversionFactor,
} from "@/lib/stock-uom";

function stockFieldKey(location, levelKey) {
  const loc = location === "shop" ? "shop" : "store";
  return `${loc}_stock_${levelKey}`;
}

function StockLocationFields({ location, label, form, onChange, uom, readOnly = false }) {
  const levels = uom ? uomStockTakeLevels(uom) : [{ key: "small", label: "units" }];

  if (levels.length === 1) {
    const key = stockFieldKey(location, "small");
    return (
      <Field label={`${label} stock`}>
        <input
          type="text"
          inputMode="decimal"
          value={form[key] ?? ""}
          onChange={(e) => onChange(key, e.target.value)}
          className={`${inputClassName()} ${readOnly ? "bg-slate-100 text-slate-700" : ""}`}
          placeholder="0"
          readOnly={readOnly}
          disabled={readOnly}
        />
        <p className="mt-1 text-xs text-slate-500">
          {readOnly ? "Read-only — updated by inventory transactions." : `Count in ${levels[0].label}.`}
        </p>
      </Field>
    );
  }

  const byKey = {};
  for (const level of levels) {
    byKey[level.key] = form[stockFieldKey(location, level.key)];
  }
  const preview = uom
    ? formatMixedStockDisplay(stockTakeCountsToBase(byKey, uom), uom).text
    : null;

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-slate-800">{label} stock</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {levels.map((level) => {
          const key = stockFieldKey(location, level.key);
          return (
            <Field key={key} label={level.label}>
              <input
                type="text"
                inputMode="decimal"
                value={form[key] ?? ""}
                onChange={(e) => onChange(key, e.target.value)}
                className={`${inputClassName()} ${readOnly ? "bg-slate-100 text-slate-700" : ""}`}
                placeholder="0"
                readOnly={readOnly}
                disabled={readOnly}
              />
            </Field>
          );
        })}
      </div>
      {preview ? (
        <p className="text-xs text-slate-500">
          Total: <span className="font-mono text-slate-700">{preview}</span>
        </p>
      ) : null}
      {readOnly ? (
        <p className="text-xs text-slate-500">Read-only — updated by inventory transactions.</p>
      ) : null}
    </div>
  );
}

export function ProductInventoryFields({
  form,
  onChange,
  productUom,
  globalReorderLevel = null,
  stockReadOnly = true,
  productCode = null,
}) {
  const [guideOpen, setGuideOpen] = useState(false);
  const packName = productUom ? fullPackageLabel(productUom) : "full package";
  const smallName = productUom ? smallPackagingLabel(productUom) : "units";
  const hasFull = productUom ? uomHasFullPack(productUom) : false;
  const factor = productUom ? uomConversionFactor(productUom) : 1;
  const globalDisplay =
    globalReorderLevel != null && factor > 1
      ? baseToDisplayQty(globalReorderLevel, factor)
      : globalReorderLevel;

  const reorderLabel = hasFull
    ? `Reorder level (${packName})`
    : `Reorder level (${smallName})`;

  return (
    <>
      <div className="md:col-span-2 xl:col-span-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
        <p className="text-sm text-slate-700">
          {stockReadOnly
            ? "Stock on hand is shown for reference only. Changes must go through inventory transactions so POS, reports, and stock levels stay aligned."
            : "Enter opening stock using the product's UOM packaging — same as stock take and inventory reports."}
        </p>
        {productUom && uomConversionSummary(productUom) ? (
          <p className="mt-1 text-xs font-medium text-slate-600">
            {uomConversionSummary(productUom)}
          </p>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Select a unit of measure to see packaging fields.</p>
        )}
        {stockReadOnly ? (
          <div className="mt-3">
            <AdjustStockGuideTrigger onClick={() => setGuideOpen(true)} />
          </div>
        ) : null}
      </div>

      <div className="md:col-span-1">
        <StockLocationFields
          location="shop"
          label="Shop"
          form={form}
          onChange={onChange}
          uom={productUom}
          readOnly={stockReadOnly}
        />
      </div>

      <div className="md:col-span-1">
        <StockLocationFields
          location="store"
          label="Store / warehouse"
          form={form}
          onChange={onChange}
          uom={productUom}
          readOnly={stockReadOnly}
        />
      </div>

      <div className="md:col-span-2 xl:col-span-3">
        <Field label={reorderLabel}>
          <input
            type="text"
            inputMode="decimal"
            value={form.reorder_packs}
            onChange={(e) => onChange("reorder_packs", e.target.value)}
            className={inputClassName()}
            placeholder="0"
          />
          <p className="mt-1 text-xs leading-relaxed text-slate-500">
            {hasFull ? (
              <>
                Minimum stock in <strong>{packName}</strong> before a low-stock alert. Example: sugar
                with 50&nbsp;kg bags — enter <strong>2</strong> to alert when total stock falls below 2
                bags.
              </>
            ) : (
              <>
                Minimum stock in <strong>{smallName}</strong> before a low-stock alert is raised.
              </>
            )}{" "}
            Leave at <strong>0</strong> to use the organisation default
            {globalDisplay != null ? (
              <>
                {" "}
                (<strong>{globalDisplay}</strong> {hasFull ? packName : smallName})
              </>
            ) : null}
            .
          </p>
        </Field>
      </div>

      <AdjustStockGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        productCode={productCode}
      />
    </>
  );
}

export function stockBaseFromForm(form, location, uom) {
  const loc = location === "shop" ? "shop" : "store";
  if (!uom || !uomHasFullPack(uom)) {
    return Number(form[`${loc}_stock_small`] ?? 0);
  }
  return stockTakeCountsToBase(
    {
      full: form[`${loc}_stock_full`],
      middle: form[`${loc}_stock_middle`],
      small: form[`${loc}_stock_small`],
    },
    uom,
  );
}

export function reorderBaseFromForm(form, uom) {
  const packs = Number(form.reorder_packs ?? 0);
  if (!packs) return 0;
  const factor = uom ? uomConversionFactor(uom) : 1;
  if (factor > 1) return packs * factor;
  return packs;
}

export function stockHierarchyToForm(baseQty, uom) {
  const { full, middle, small } = baseToHierarchyCounts(baseQty, uom);
  return {
    full: String(full),
    middle: String(middle),
    small: String(small),
  };
}
