"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  EMPTY_PRICING_TIER,
  measureLevelLabel,
  uomMeasureLevels,
} from "@/lib/uom-packaging";

export function RetailPricingTiersEditor({ tiers, onChange, productUom }) {
  const levels = uomMeasureLevels(productUom);

  function updateTier(index, patch) {
    onChange(tiers.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addTier() {
    const last = tiers[tiers.length - 1];
    const nextMin =
      last?.max_qty !== "" && last?.max_qty != null
        ? String(Number(last.max_qty) + 1)
        : "";
    onChange([
      ...tiers,
      {
        ...EMPTY_PRICING_TIER,
        min_qty: nextMin,
        measure_level: levels[0]?.level ?? "small",
      },
    ]);
  }

  function removeTier(index) {
    onChange(tiers.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-slate-600">
        Set retail quantity ranges in <strong>{levels[0]?.label ?? "small units"}</strong> with a
        markup per unit. Quantities outside all tiers are sold at wholesale (base price, no markup).
        Measurements come from the product UOM.
      </p>

      {tiers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
          No retail tiers — all sales use wholesale pricing.
        </p>
      ) : (
        tiers.map((tier, index) => (
          <div
            key={index}
            className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50/80 p-3 sm:grid-cols-2 lg:grid-cols-5"
          >
            <Field label="From">
              <input
                type="number"
                min="0"
                step="any"
                className={inputClassName()}
                value={tier.min_qty}
                onChange={(e) => updateTier(index, { min_qty: e.target.value })}
              />
            </Field>
            <Field label="To">
              <input
                type="number"
                min="0"
                step="any"
                className={inputClassName()}
                value={tier.max_qty}
                onChange={(e) => updateTier(index, { max_qty: e.target.value })}
                placeholder="No limit"
              />
            </Field>
            <Field label="Measured as">
              <select
                className={inputClassName()}
                value={tier.measure_level}
                onChange={(e) => updateTier(index, { measure_level: e.target.value })}
              >
                {levels.map((l) => (
                  <option key={l.level} value={l.level}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Markup (KES/unit)">
              <input
                type="number"
                min="0"
                step="any"
                className={inputClassName()}
                value={tier.markup_price}
                onChange={(e) => updateTier(index, { markup_price: e.target.value })}
              />
            </Field>
            <div className="flex items-end justify-between gap-2 sm:col-span-2 lg:col-span-1">
              <p className="pb-2 text-[11px] text-slate-500">
                {measureLevelLabel(productUom, tier.measure_level)}
              </p>
              <button
                type="button"
                onClick={() => removeTier(index)}
                className="rounded-lg border border-red-200 px-2 py-1.5 text-xs text-red-700 hover:bg-red-50"
              >
                Remove
              </button>
            </div>
          </div>
        ))
      )}

      <button
        type="button"
        onClick={addTier}
        className="text-sm font-medium text-[#185FA5] hover:underline"
      >
        + Add retail tier
      </button>
    </div>
  );
}
