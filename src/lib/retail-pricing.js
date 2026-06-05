/** Client-side retail tier pricing (mirrors API RetailPricing). */

import {
  fullPackageLabel,
  middlePackagingLabel,
  normalizePricingTiers,
  smallPackagingLabel,
  uomHasMiddlePack,
} from "./uom-packaging";
import { splitBaseToHierarchy, uomConversionFactor } from "./stock-uom";

export function tiersForRetailPackage(retailPackage) {
  if (!retailPackage) return [];
  const raw = retailPackage.pricing_tiers;
  if (Array.isArray(raw) && raw.length > 0) {
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
      markup_price: Number(rps.markup_price ?? 0),
    });
  }
  if (Number(rps.wholesale_qty_measure ?? 0) > 0) {
    tiers.push({
      min_qty: Number(rps.max_qty_measure ?? 0) + 0.001,
      max_qty: Number(rps.wholesale_qty_measure),
      measure_level: "middle",
      markup_price: Number(rps.wholesale_markup_price ?? 0),
    });
  }
  return tiers;
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

export function retailUnitPrice(baseUnitPrice, tiers, quantityInSmall) {
  const base = Number(baseUnitPrice ?? 0);
  const tier = tierForQuantity(tiers, quantityInSmall);
  if (!tier) return base;
  return base + Number(tier.markup_price ?? 0);
}

export function linePrice(baseUnitPrice, tiers, quantityInSmall, isRetail = true) {
  const qty = Number(quantityInSmall ?? 0);
  if (!isRetail || !tiers.length) {
    return Math.round(baseUnitPrice * qty * 100) / 100;
  }
  const perUnit = retailUnitPrice(baseUnitPrice, tiers, qty);
  return Math.round(perUnit * qty * 100) / 100;
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
export function priceForMeasureLevel(baseUnitPrice, tiers, uom, level, sellOnRetail) {
  const qty = smallUnitsPerLevel(uom, level);
  return linePrice(baseUnitPrice, tiers, qty, sellOnRetail);
}

/** Value stock by pricing each hierarchy part at its own tier quantity. */
export function stockSellingValue(baseQty, unitPrice, uom, retailPackage, sellOnRetail) {
  const qty = Number(baseQty ?? 0);
  if (qty <= 0) return 0;

  const tiers = tiersForRetailPackage(retailPackage);
  const sellRetail = Boolean(sellOnRetail) && tiers.length > 0;

  if (!sellRetail) {
    return Math.round(Number(unitPrice ?? 0) * qty * 100) / 100;
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

    total += linePrice(unitPrice, tiers, smallQty, true);
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
