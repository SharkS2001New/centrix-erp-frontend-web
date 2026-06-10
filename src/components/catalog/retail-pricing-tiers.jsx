"use client";

import { useEffect } from "react";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  retailPriceAtMeasureLevel,
  wholesalePriceAtMeasureLevel,
} from "@/lib/retail-pricing";
import {
  EMPTY_PRICING_TIER,
  measureLevelLabel,
  uomMeasureLevels,
} from "@/lib/uom-packaging";

export function defaultRetailPricingTier(productUom) {
  return {
    ...EMPTY_PRICING_TIER,
    min_qty: "1",
    measure_level: "small",
  };
}

export function RetailPricingTiersEditor({
  tiers,
  onChange,
  productUom,
  unitPrice = "",
}) {
  const levels = uomMeasureLevels(productUom);
  const smallLabel = levels[0]?.label ?? "small unit";
  const wholesalePerSmall = productUom
    ? wholesalePriceAtMeasureLevel(Number(unitPrice) || 0, productUom, "small")
    : null;

  useEffect(() => {
    if (!productUom || !tiers.length) return;
    const valid = new Set(uomMeasureLevels(productUom).map((l) => l.level));
    const needsFix = tiers.some((row) => !valid.has(row.measure_level || "small"));
    if (!needsFix) return;
    onChange(
      tiers.map((row) =>
        valid.has(row.measure_level || "small")
          ? row
          : { ...row, measure_level: "small" },
      ),
    );
  }, [productUom?.id]);

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
        ...defaultRetailPricingTier(productUom),
        min_qty: nextMin,
      },
    ]);
  }

  function removeTier(index) {
    onChange(tiers.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-slate-600">
        Quantity ranges (From / To) are counted in <strong>{smallLabel}</strong>. Choose{" "}
        <strong>Measured as</strong> for the selling unit on each tier — options come from the
        product UOM ({levels.map((l) => l.label).join(", ") || "select UOM first"}). Retail price =
        wholesale price ÷ conversion factor + markup for that tier&apos;s unit.
        {wholesalePerSmall != null && Number(unitPrice) > 0 ? (
          <>
            {" "}
            Base wholesale per {smallLabel}:{" "}
            <strong>{wholesalePerSmall.toLocaleString(undefined, { maximumFractionDigits: 2 })} KES</strong>.
          </>
        ) : null}
      </p>

      {!productUom ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Select a unit of measure first — measured-as options come from the product UOM.
        </p>
      ) : null}

      {tiers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-sm text-slate-500">
          No retail tiers — all sales use wholesale pricing.
        </p>
      ) : (
        tiers.map((tier, index) => {
          const levelLabel = measureLevelLabel(productUom, tier.measure_level || "small");
          const baseAtLevel =
            productUom && Number(unitPrice) > 0
              ? wholesalePriceAtMeasureLevel(
                  Number(unitPrice),
                  productUom,
                  tier.measure_level || "small",
                )
              : null;
          const retailAtLevel =
            productUom && Number(unitPrice) >= 0
              ? retailPriceAtMeasureLevel(
                  Number(unitPrice) || 0,
                  tier,
                  productUom,
                )
              : null;

          return (
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
                  value={tier.measure_level || "small"}
                  onChange={(e) => updateTier(index, { measure_level: e.target.value })}
                  disabled={!productUom}
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
              <div className="flex flex-col justify-end gap-1 sm:col-span-2 lg:col-span-1">
                <p className="text-[11px] text-slate-600">
                  {levelLabel}
                  {baseAtLevel != null ? (
                    <>
                      {" "}
                      · wholesale {baseAtLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                      + markup
                    </>
                  ) : null}
                </p>
                {retailAtLevel != null ? (
                  <p className="text-[11px] font-semibold text-[#185FA5]">
                    Retail: {retailAtLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })}{" "}
                    KES per {levelLabel}
                  </p>
                ) : null}
                <button
                  type="button"
                  onClick={() => removeTier(index)}
                  className="self-start rounded-lg border border-red-200 px-2 py-1.5 text-xs text-red-700 hover:bg-red-50"
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })
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
