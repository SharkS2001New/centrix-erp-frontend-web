"use client";

import { useEffect } from "react";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  linePriceForTier,
  smallUnitsPerLevel,
  tierPriceAtMeasureLevel,
  wholesalePriceAtMeasureLevel,
} from "@/lib/retail-pricing";
import {
  EMPTY_PRICING_TIER,
  measureLevelLabel,
  normalizeTierPriceMode,
  tierPriceModeLabel,
  uomMeasureLevels,
} from "@/lib/uom-packaging";

export function defaultRetailPricingTier(productUom, priceMode = "retail") {
  const levels = uomMeasureLevels(productUom);
  const defaultLevel =
    priceMode === "wholesale"
      ? levels.find((l) => l.level === "full")?.level ??
        levels[levels.length - 1]?.level ??
        "small"
      : "small";

  return {
    ...EMPTY_PRICING_TIER,
    min_qty: "1",
    measure_level: defaultLevel,
    price_mode: priceMode,
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
    const nextMode =
      last && normalizeTierPriceMode(last) === "retail" ? "wholesale" : "retail";
    onChange([
      ...tiers,
      {
        ...defaultRetailPricingTier(productUom, nextMode),
        min_qty: nextMin,
      },
    ]);
  }

  function removeTier(index) {
    onChange(tiers.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <p className="theme-subtext text-xs leading-relaxed">
        Quantity ranges (From / To) are counted in <strong>{smallLabel}</strong>. Mark each tier as{" "}
        <strong>Retail</strong> or <strong>Wholesale</strong>:
        <strong> Retail</strong> = wholesale base at the measured unit ÷ conversion + markup per that
        unit; <strong>Wholesale</strong> = catalog wholesale subtotal at the measured unit(s) + markup
        on the <strong>line total</strong> (not per unit).
        {wholesalePerSmall != null && Number(unitPrice) > 0 ? (
          <>
            {" "}
            Base wholesale per {smallLabel}:{" "}
            <strong>
              {wholesalePerSmall.toLocaleString(undefined, { maximumFractionDigits: 2 })} KES
            </strong>
            .
          </>
        ) : null}
      </p>

      {!productUom ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Select a unit of measure first — measured-as options come from the product UOM.
        </p>
      ) : null}

      {tiers.length === 0 ? (
        <p className="rounded-lg border border-dashed border-[var(--theme-border)] px-3 py-4 text-sm theme-subtext">
          No pricing tiers — wholesale catalog price applies.
        </p>
      ) : (
        tiers.map((tier, index) => {
          const priceMode = normalizeTierPriceMode(tier);
          const levelLabel = measureLevelLabel(productUom, tier.measure_level || "small");
          const baseAtLevel =
            productUom && Number(unitPrice) > 0
              ? wholesalePriceAtMeasureLevel(
                  Number(unitPrice),
                  productUom,
                  tier.measure_level || "small",
                )
              : null;
          const sellAtLevel =
            productUom && Number(unitPrice) >= 0
              ? priceMode === "wholesale"
                ? linePriceForTier(Number(unitPrice) || 0, tier, smallUnitsPerLevel(productUom, tier.measure_level || "small"), productUom)
                : tierPriceAtMeasureLevel(Number(unitPrice) || 0, tier, productUom)
              : null;

          return (
            <div
              key={index}
              className="grid gap-2 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] p-3 sm:grid-cols-2 lg:grid-cols-6"
            >
              <Field label="Price type">
                <select
                  className={inputClassName()}
                  value={priceMode}
                  onChange={(e) => updateTier(index, { price_mode: e.target.value })}
                >
                  <option value="retail">Retail</option>
                  <option value="wholesale">Wholesale</option>
                </select>
              </Field>
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
              <Field label={priceMode === "wholesale" ? "Line markup (KES)" : "Markup (KES/unit)"}>
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
                <p className="text-[11px] theme-subtext">
                  {tierPriceModeLabel(priceMode)} · {levelLabel}
                  {baseAtLevel != null ? (
                    <>
                      {" "}
                      · base {baseAtLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      {priceMode === "wholesale" ? " + line markup" : " + markup"}
                    </>
                  ) : null}
                </p>
                {sellAtLevel != null ? (
                  <p className="text-[11px] font-semibold text-[var(--theme-primary)]">
                    {priceMode === "wholesale" ? "Line total (1 unit)" : "Sell"}:{" "}
                    {sellAtLevel.toLocaleString(undefined, { maximumFractionDigits: 2 })} KES
                    {priceMode === "wholesale" ? "" : ` per ${levelLabel}`}
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
        className="text-sm font-medium text-[var(--theme-primary)] hover:underline"
      >
        + Add tier
      </button>
    </div>
  );
}
