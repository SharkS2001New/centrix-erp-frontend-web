/**
 * Product price sheet — computed from catalog unit_price, UOM, and retail package tiers.
 */

import {
  fullPackageLabel,
  middlePackagingLabel,
  smallPackagingLabel,
  uomHasFullPack,
  uomHasMiddlePack,
} from "./uom-packaging";
import {
  priceForMeasureLevel,
  tierForMeasureLevel,
  tiersForRetailPackage,
  tiersWithPriceMode,
  wholesalePriceAtMeasureLevel,
  wholesaleTierPriceAtMeasureLevel,
} from "./retail-pricing";
import { uomConversionFactor } from "./stock-uom";
import { computeProfitMarginPercent } from "./product-margin";

export function formatPriceSheetAmount(value) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return null;
  return Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Packaging label e.g. "1 x 16pcs" or "1 x 60 pcs". */
export function priceSheetPackagingLabel(uom) {
  if (!uom) return "—";
  const factor = uomConversionFactor(uom);
  const small = smallPackagingLabel(uom);
  if (factor <= 1) return `1 ${small}`;
  return `1 x ${factor}${small}`;
}

function aboveDozensTierPrice(unitPrice, tiers, uom) {
  const wholesaleTiers = tiersWithPriceMode(tiers, "wholesale");
  const tier =
    wholesaleTiers.find((t) => (t.measure_level || "small") === "middle") ??
    wholesaleTiers[0] ??
    tiers[1];
  if (!tier) return null;
  return wholesaleTierPriceAtMeasureLevel(unitPrice, tier, uom);
}

function wholesaleColumnPrice(unitPrice, tiers, uom) {
  const tier =
    tierForMeasureLevel(tiers, "full", "wholesale") ??
    tiersWithPriceMode(tiers, "wholesale").find((t) => (t.measure_level || "small") === "full") ??
    tiersWithPriceMode(tiers, "wholesale")[0];
  if (tier) {
    return wholesaleTierPriceAtMeasureLevel(unitPrice, tier, uom);
  }
  return uomHasFullPack(uom)
    ? wholesalePriceAtMeasureLevel(unitPrice, uom, "full")
    : wholesalePriceAtMeasureLevel(unitPrice, uom, "small");
}

/**
 * Build one price-sheet row for a product.
 * Respects org retail setting, sell_on_retail, unit_price, UOM, and retail package tiers.
 */
export function buildPriceSheetRow({
  product,
  uom,
  retailPackage,
  categoryName = "Uncategorized",
  subcategoryName = "Uncategorized",
  retailPricingEnabled = true,
  lastCostPrice = null,
}) {
  const unitPrice = Number(product?.unit_price ?? 0);
  const costPrice = Number(lastCostPrice ?? product?.last_cost_price ?? 0);
  const hasUnitPrice = unitPrice > 0;
  const sellOnRetail = Boolean(
    retailPricingEnabled &&
      hasUnitPrice &&
      (product?.sell_on_retail === 1 || product?.sell_on_retail === true),
  );
  const tiers = tiersForRetailPackage(retailPackage);
  const hasTiers = tiers.length > 0;

  const retailPrice = hasUnitPrice
    ? priceForMeasureLevel(unitPrice, tiers, uom, "small", sellOnRetail && hasTiers, "retail")
    : null;

  const dozensPrice =
    hasUnitPrice && uomHasMiddlePack(uom)
      ? priceForMeasureLevel(unitPrice, tiers, uom, "middle", sellOnRetail && hasTiers, "retail")
      : null;

  const aboveDozensPrice =
    hasUnitPrice && sellOnRetail && tiersWithPriceMode(tiers, "wholesale").length > 0
      ? aboveDozensTierPrice(unitPrice, tiers, uom)
      : null;

  const wholesalePrice = hasUnitPrice ? wholesaleColumnPrice(unitPrice, tiers, uom) : null;

  return {
    product_code: product?.product_code,
    product_name: product?.product_name ?? product?.product_code ?? "—",
    category_name: categoryName,
    subcategory_name: subcategoryName,
    packaging: priceSheetPackagingLabel(uom),
    unit_price: unitPrice,
    last_cost_price: costPrice > 0 ? costPrice : null,
    sell_on_retail: sellOnRetail,
    has_tiers: hasTiers,
    has_middle_pack: uomHasMiddlePack(uom),
    has_full_pack: uomHasFullPack(uom),
    retail_price: retailPrice,
    dozens_price: dozensPrice,
    above_dozens_price: aboveDozensPrice,
    wholesale_price: wholesalePrice,
    wholesale_margin: computeProfitMarginPercent(wholesalePrice, costPrice),
    retail_margin: computeProfitMarginPercent(retailPrice, costPrice),
    dozens_margin: computeProfitMarginPercent(dozensPrice, costPrice),
    above_dozens_margin: computeProfitMarginPercent(aboveDozensPrice, costPrice),
    retail_label: smallPackagingLabel(uom),
    dozens_label: middlePackagingLabel(uom) || "dozen",
    wholesale_label: fullPackageLabel(uom),
  };
}

/** Column visibility for the org price sheet. */
export function priceSheetColumnVisibility(rows, { retailPricingEnabled = true } = {}) {
  const list = rows ?? [];
  const showRetail =
    retailPricingEnabled &&
    list.some((r) => r.sell_on_retail && r.retail_price != null);
  const showDozens =
    retailPricingEnabled &&
    list.some((r) => r.sell_on_retail && r.has_middle_pack && r.dozens_price != null);
  const showAboveDozens =
    retailPricingEnabled &&
    list.some((r) => r.sell_on_retail && r.above_dozens_price != null);
  const showWholesale = list.some((r) => r.wholesale_price != null);

  return {
    retail: showRetail,
    dozens: showDozens,
    aboveDozens: showAboveDozens,
    wholesale: showWholesale,
  };
}

/** Group rows by subcategory name (sorted). */
export function groupPriceSheetBySubcategory(rows) {
  const map = new Map();
  for (const row of rows ?? []) {
    const key = row.subcategory_name || row.category_name || "Uncategorized";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([subcategory, items]) => ({
      category: subcategory,
      items: items.sort((a, b) =>
        String(a.product_name).localeCompare(String(b.product_name)),
      ),
    }));
}

/** Group rows by category name (sorted). */
export function groupPriceSheetByCategory(rows) {
  const map = new Map();
  for (const row of rows ?? []) {
    const key = row.category_name || "Uncategorized";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, items]) => ({
      category,
      items: items.sort((x, y) =>
        String(x.product_name).localeCompare(String(y.product_name)),
      ),
    }));
}

export function priceSheetCellValue(price, enabled = true) {
  if (!enabled) return "—";
  if (price == null || !Number.isFinite(Number(price))) return "N/A";
  return formatPriceSheetAmount(price);
}

export function priceSheetPriceWithMargin(price, marginPercent, enabled = true) {
  const amount = priceSheetCellValue(price, enabled);
  if (amount === "—" || amount === "N/A") return amount;
  if (marginPercent == null || !Number.isFinite(Number(marginPercent))) return amount;
  return `${amount} (${Number(marginPercent)}%)`;
}
