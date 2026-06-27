/** Client-side retail tier pricing (mirrors API RetailPricing). */

import {
  coercePricingTiersInput,
  fullPackageLabel,
  middlePackagingLabel,
  normalizePricingTiers,
  normalizeTierPriceMode,
  smallPackagingLabel,
  uomHasMiddlePack,
} from "./uom-packaging";
import { splitBaseToHierarchy, uomConversionFactor } from "./stock-uom";

export function tiersForRetailPackage(retailPackage) {
  if (!retailPackage) return [];
  const raw = coercePricingTiersInput(retailPackage.pricing_tiers);
  if (raw.length > 0) {
    return pricingTiersToNormalized(raw);
  }
  return legacyTiersFromPackage(retailPackage);
}

function pricingTiersToNormalized(tiers) {
  return normalizePricingTiers(tiers)
    .filter((t) => t.min_qty !== "" && t.min_qty != null)
    .map((t) => ({
      min_qty: Number(t.min_qty),
      max_qty: t.max_qty === "" || t.max_qty == null ? null : Number(t.max_qty),
      measure_level: t.measure_level || "small",
      price_mode: normalizeTierPriceMode(t),
      markup_price: Number(t.markup_price ?? 0),
    }))
    .sort((a, b) => a.min_qty - b.min_qty);
}

function legacyTiersFromPackage(rps) {
  const tiers = [];
  if (Number(rps.max_qty_measure ?? 0) > 0) {
    tiers.push({
      min_qty: 1,
      max_qty: Number(rps.max_qty_measure),
      measure_level: "small",
      price_mode: "retail",
      markup_price: Number(rps.markup_price ?? 0),
    });
  }
  if (Number(rps.wholesale_qty_measure ?? 0) > 0) {
    tiers.push({
      min_qty: Number(rps.max_qty_measure ?? 0) + 0.001,
      max_qty: Number(rps.wholesale_qty_measure),
      measure_level: "middle",
      price_mode: "wholesale",
      markup_price: Number(rps.wholesale_markup_price ?? 0),
    });
  }
  return tiers;
}

export { normalizeTierPriceMode };

export function tiersWithPriceMode(tiers, priceMode) {
  const mode = normalizeTierPriceMode({ price_mode: priceMode });
  return (tiers ?? []).filter((tier) => normalizeTierPriceMode(tier) === mode);
}

export function tierForMeasureLevel(tiers, level, priceMode = null) {
  const matches = (tiers ?? []).filter((tier) => (tier.measure_level || "small") === level);
  if (priceMode) {
    const mode = normalizeTierPriceMode({ price_mode: priceMode });
    return matches.find((tier) => normalizeTierPriceMode(tier) === mode) ?? null;
  }
  return matches[0] ?? null;
}

export function tierForQuantity(tiers, quantity) {
  const qty = Number(quantity ?? 0);
  for (const tier of tiers) {
    if (qty + 0.0001 < tier.min_qty) continue;
    if (tier.max_qty != null && qty > tier.max_qty + 0.0001) continue;
    return tier;
  }
  return null;
}

/** Catalog unit_price is per full pack when conversion_factor > 1, else per small unit. */
export function wholesalePricePerSmallUnit(baseUnitPrice, uom) {
  const base = Number(baseUnitPrice ?? 0);
  const factor = uomConversionFactor(uom);
  if (factor <= 1) return base;
  return base / factor;
}

/** Wholesale price for exactly one unit at full / middle / small level. */
export function wholesalePriceAtMeasureLevel(baseUnitPrice, uom, level) {
  const base = Number(baseUnitPrice ?? 0);
  const factor = uomConversionFactor(uom);
  if (factor <= 1) return base;
  if (level === "full") return base;
  if (level === "middle" && uomHasMiddlePack(uom)) {
    const mid = Number(uom.middle_factor ?? 1);
    return (base / factor) * mid;
  }
  return base / factor;
}

/** Catalog wholesale price at the tier's measure level (no markup). */
export function wholesaleTierBaseAtMeasureLevel(baseUnitPrice, tier, uom) {
  return wholesalePriceAtMeasureLevel(baseUnitPrice, uom, tier?.measure_level ?? "small");
}

/** Selling price for one unit at the tier's measure level (retail tiers include per-unit markup). */
export function tierPriceAtMeasureLevel(baseUnitPrice, tier, uom) {
  const wholesaleBase = wholesaleTierBaseAtMeasureLevel(baseUnitPrice, tier, uom);
  const markup = Number(tier?.markup_price ?? 0);
  if (normalizeTierPriceMode(tier) === "wholesale") {
    return wholesaleBase;
  }
  return wholesaleBase + markup;
}

/** Retail price for one unit at the tier's measure level: wholesale ÷ factor + markup. */
export function retailPriceAtMeasureLevel(baseUnitPrice, tier, uom) {
  return tierPriceAtMeasureLevel(baseUnitPrice, tier, uom);
}

/**
 * Wholesale tier list/display price for exactly one measured unit (e.g. one carton).
 * When markup is configured on the line total, this is base + markup for qty = 1 unit.
 */
export function wholesaleTierPriceAtMeasureLevel(baseUnitPrice, tier, uom) {
  const wholesaleBase = wholesaleTierBaseAtMeasureLevel(baseUnitPrice, tier, uom);
  const markup = Number(tier?.markup_price ?? 0);
  if (normalizeTierPriceMode(tier) === "wholesale") {
    return wholesaleBase + markup;
  }
  return wholesaleBase + markup;
}

/** Per-small-unit price for a quantity that falls in a tier range. */
export function retailUnitPrice(baseUnitPrice, tiers, quantityInSmall, uom = null) {
  const tier = tierForQuantity(tiers, quantityInSmall);
  if (!tier) {
    return wholesalePricePerSmallUnit(baseUnitPrice, uom);
  }
  return unitPricePerSmallForTier(baseUnitPrice, tier, uom);
}

export function unitPricePerSmallForTier(baseUnitPrice, tier, uom) {
  const priceAtLevel = tierPriceAtMeasureLevel(baseUnitPrice, tier, uom);
  const smallPerLevel = smallUnitsPerLevel(uom, tier.measure_level ?? "small");
  return priceAtLevel / smallPerLevel;
}

export function linePriceForTier(baseUnitPrice, tier, quantityInSmall, uom) {
  const qty = Number(quantityInSmall ?? 0);
  const wholesaleBase = wholesaleTierBaseAtMeasureLevel(baseUnitPrice, tier, uom);
  const markup = Number(tier?.markup_price ?? 0);
  const smallPerLevel = smallUnitsPerLevel(uom, tier.measure_level ?? "small");
  const mode = normalizeTierPriceMode(tier);

  if (mode === "wholesale") {
    const measureUnits = smallPerLevel > 0 ? qty / smallPerLevel : qty;
    const baseTotal = wholesaleBase * measureUnits;
    return Math.round((baseTotal + markup) * 100) / 100;
  }

  const priceAtLevel = wholesaleBase + markup;
  const perSmall = priceAtLevel / smallPerLevel;
  return Math.round(perSmall * qty * 100) / 100;
}

export function linePrice(baseUnitPrice, tiers, quantityInSmall, isRetail = true, uom = null) {
  const qty = Number(quantityInSmall ?? 0);
  if (!tiers?.length) {
    const perSmall = wholesalePricePerSmallUnit(baseUnitPrice, uom);
    return Math.round(perSmall * qty * 100) / 100;
  }

  const applicableTiers = isRetail ? tiers : tiersWithPriceMode(tiers, "wholesale");
  const tier = tierForQuantity(applicableTiers, qty);
  if (!tier) {
    const perSmall = wholesalePricePerSmallUnit(baseUnitPrice, uom);
    return Math.round(perSmall * qty * 100) / 100;
  }

  return linePriceForTier(baseUnitPrice, tier, qty, uom);
}

/** Small units represented by one count at a packaging level. */
export function smallUnitsPerLevel(uom, level) {
  const factor = uomConversionFactor(uom);
  if (level === "full") return factor > 1 ? factor : 1;
  if (level === "middle" && uomHasMiddlePack(uom)) {
    return Number(uom.middle_factor ?? 1);
  }
  return 1;
}

/** Selling price for exactly one unit at full / middle / small level. */
export function priceForMeasureLevel(
  baseUnitPrice,
  tiers,
  uom,
  level,
  sellOnRetail,
  priceMode = null,
) {
  const wholesaleAtLevel = wholesalePriceAtMeasureLevel(baseUnitPrice, uom, level);
  if (!sellOnRetail || !tiers.length) {
    const wholesaleTier = tierForMeasureLevel(tiers, level, "wholesale");
    if (wholesaleTier) {
      return wholesaleTierPriceAtMeasureLevel(baseUnitPrice, wholesaleTier, uom);
    }
    return wholesaleAtLevel;
  }

  const retailTier = tierForMeasureLevel(tiers, level, priceMode ?? "retail");
  if (retailTier) {
    return tierPriceAtMeasureLevel(baseUnitPrice, retailTier, uom);
  }

  const qtyAtLevel = smallUnitsPerLevel(uom, level);
  const tier =
    tierForQuantity(tiersWithPriceMode(tiers, "retail"), qtyAtLevel) ??
    tierForQuantity(tiers, qtyAtLevel) ??
    tiers.find((t) => (t.measure_level || "small") === level);

  if (!tier) return wholesaleAtLevel;
  return tierPriceAtMeasureLevel(baseUnitPrice, tier, uom);
}

/** Value stock by pricing each hierarchy part at its own tier quantity. */
export function stockSellingValue(baseQty, unitPrice, uom, retailPackage, sellOnRetail) {
  const qty = Number(baseQty ?? 0);
  if (qty <= 0) return 0;

  const tiers = tiersForRetailPackage(retailPackage);
  const sellRetail = Boolean(sellOnRetail) && tiers.length > 0;

  if (!sellRetail) {
    const perSmall = wholesalePricePerSmallUnit(unitPrice, uom);
    return Math.round(perSmall * qty * 100) / 100;
  }

  const parts = splitBaseToHierarchy(qty, uom);
  const fullLabel = fullPackageLabel(uom);
  const midLabel = middlePackagingLabel(uom);
  const smallLabel = smallPackagingLabel(uom);
  const factor = uomConversionFactor(uom);
  const midFactor = Number(uom?.middle_factor ?? 0);

  let total = 0;
  for (const part of parts) {
    let smallQty = Number(part.qty ?? 0);
    if (part.label === fullLabel) smallQty = part.qty * factor;
    else if (midLabel && part.label === midLabel) smallQty = part.qty * midFactor;
    else if (part.label === smallLabel) smallQty = part.qty;

    total += linePrice(unitPrice, tiers, smallQty, true, uom);
  }

  return Math.round(total * 100) / 100;
}

export function priceListRowsForProduct({
  product,
  uom,
  retailPackage,
  shopQty = 0,
  storeQty = 0,
}) {
  const sellOnRetail = product.sell_on_retail === 1 || product.sell_on_retail === true;
  const unitPrice = Number(product.unit_price ?? 0);
  const tiers = tiersForRetailPackage(retailPackage);
  const levels = [{ level: "small", label: smallPackagingLabel(uom) }];
  if (uomHasMiddlePack(uom)) {
    levels.push({ level: "middle", label: middlePackagingLabel(uom) });
  }
  if (uomConversionFactor(uom) > 1) {
    levels.push({ level: "full", label: fullPackageLabel(uom) });
  }

  const prices = {};
  for (const { level, label } of levels) {
    prices[level] = {
      label,
      unitPrice: priceForMeasureLevel(unitPrice, tiers, uom, level, sellOnRetail),
    };
  }

  return {
    product_code: product.product_code,
    product_name: product.product_name,
    measure_name: uom?.measure_name ?? "",
    sell_on_retail: sellOnRetail,
    shop_qty: shopQty,
    store_qty: storeQty,
    base_unit_price: unitPrice,
    prices,
  };
}

export function priceListToCsv(rows) {
  const headers = [
    "Product code",
    "Product name",
    "Measure",
    "Shop stock",
    "Store stock",
    "Small unit",
    "Small price",
    "Middle unit",
    "Middle price",
    "Full unit",
    "Full price",
    "Base unit price",
    "Sells retail",
  ];

  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        csvCell(row.product_code),
        csvCell(row.product_name),
        csvCell(row.measure_name),
        row.shop_qty,
        row.store_qty,
        csvCell(row.prices.small?.label ?? ""),
        row.prices.small?.unitPrice ?? "",
        csvCell(row.prices.middle?.label ?? ""),
        row.prices.middle?.unitPrice ?? "",
        csvCell(row.prices.full?.label ?? ""),
        row.prices.full?.unitPrice ?? "",
        row.base_unit_price,
        row.sell_on_retail ? "yes" : "no",
      ].join(","),
    );
  }
  return lines.join("\n");
}

function csvCell(value) {
  const s = String(value ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
