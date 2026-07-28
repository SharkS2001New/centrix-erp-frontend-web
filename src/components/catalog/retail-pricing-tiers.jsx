"use client";

import { useEffect } from "react";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  linePriceForTier,
  retailMarkupChunkSize,
  wholesalePricePerSmallUnit,
} from "@/lib/retail-pricing";
import { uomConversionFactor } from "@/lib/stock-uom";
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

function previewQtyForTier(tier, productUom) {
  const factor = uomConversionFactor(productUom);
  const halfPack = factor >= 2 ? factor / 2 : 1;
  const maxQty =
    tier.max_qty !== "" && tier.max_qty != null ? Number(tier.max_qty) : null;
  if (factor >= 2 && maxQty != null && maxQty <= halfPack) {
    return Math.max(1, Number(tier.min_qty) || 1);
  }
  if (factor >= 2) {
    return halfPack;
  }
  return Math.max(1, Number(tier.min_qty) || 1);
}

function markupFieldLabel(tier, productUom, smallLabel) {
  const chunk = productUom ? retailMarkupChunkSize(tier, productUom) : 1;
  if (chunk > 1) {
    return `Markup (KES / ${chunk} ${smallLabel})`;
  }
  return `Markup (KES / ${smallLabel})`;
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
    ? wholesalePricePerSmallUnit(Number(unitPrice) || 0, productUom)
    : null;

  const productUomId = productUom?.id ?? null;

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
    // Reconcile invalid measure levels when the product UOM changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: avoid loops from onChange/tiers
  }, [productUomId]);

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
        Quantity ranges (From / To) are counted in <strong>{smallLabel}</strong>. Retail line
        total:{" "}
        <strong>(catalog unit price ÷ conversion × qty) + tier markup</strong>. Small bands on
        pack products apply markup per {smallLabel}; larger bands apply markup per half-bag chunk
        (e.g. 25 {smallLabel} of a 50 {smallLabel} bag).
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
          const previewQty = productUom ? previewQtyForTier(tier, productUom) : 1;
          const lineExample =
            productUom && Number(unitPrice) >= 0
              ? linePriceForTier(Number(unitPrice) || 0, tier, previewQty, productUom)
              : null;
          const wholesaleBase =
            productUom && Number(unitPrice) > 0
              ? wholesalePricePerSmallUnit(Number(unitPrice), productUom) * previewQty
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
              <Field label={markupFieldLabel(tier, productUom, smallLabel)}>
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
                  {wholesaleBase != null ? (
                    <>
                      {" "}
                      · base {wholesaleBase.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      {" + markup"}
                    </>
                  ) : null}
                </p>
                {lineExample != null ? (
                  <p className="text-[11px] font-semibold text-[var(--theme-primary)]">
                    Example {previewQty} {smallLabel} line:{" "}
                    {lineExample.toLocaleString(undefined, { maximumFractionDigits: 2 })} KES
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
