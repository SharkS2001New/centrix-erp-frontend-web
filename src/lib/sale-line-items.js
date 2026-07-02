import { cartLineDisplayUnitPrice, posEntryQtyFromCartLine, posEntryToBaseQty } from "@/lib/pos-line";
import {
  tierForQuantity,
  tiersForRetailPackage,
  tiersWithPriceMode,
  wholesalePriceAtMeasureLevel,
  wholesalePricePerSmallUnit,
} from "@/lib/retail-pricing";
import {
  formatDisplayQty,
  formatMixedStockDisplay,
  formatPosCartQty,
  splitBaseToHierarchy,
  uomConversionFactor,
} from "@/lib/stock-uom";
import { fullPackageLabel, smallPackagingLabel } from "@/lib/uom-packaging";

export function saleLineUom(line, uomById) {
  if (line?.product?.unit_id != null && uomById?.get) {
    return uomById.get(line.product.unit_id) ?? null;
  }
  return line?.product?.unit ?? line?.product?.uom ?? null;
}

/** Product row with resolved UOM for POS-style qty entry. */
export function saleLineProductForQty(line, uomById) {
  const uom = saleLineUom(line, uomById);
  if (!line?.product) return null;
  return { ...line.product, uom };
}

/** Display qty for order line edit — respects UOM conversion and retail packages. */
export function saleLineEntryQtyForEdit(line, uomById, retailByCode = {}) {
  const product = saleLineProductForQty(line, uomById);
  const retailPackage = retailByCode[line?.product_code] ?? null;
  return posEntryQtyFromCartLine(
    { quantity: line?.quantity, on_wholesale_retail: line?.on_wholesale_retail },
    product,
    retailPackage,
  );
}

/** Convert edited display qty back to base (stock) units for the API. */
export function saleLineEntryQtyToBase(line, entryQty, uomById, retailByCode = {}) {
  const product = saleLineProductForQty(line, uomById);
  const retailPackage = retailByCode[line?.product_code] ?? null;
  const isRetailLine = Number(line?.on_wholesale_retail) === 1;
  return posEntryToBaseQty(entryQty, product, !isRetailLine, retailPackage);
}

/** Product display name from nested API relation or a code → product map. */
export function saleLineProductName(line, productByCode) {
  const fromRelation = line?.product?.product_name;
  if (fromRelation) return fromRelation;
  const code = line?.product_code;
  if (code && productByCode?.[code]?.product_name) {
    return productByCode[code].product_name;
  }
  return null;
}

export function saleLineProductLabel(line, productByCode) {
  return saleLineProductName(line, productByCode) || line?.product_code || "—";
}

export function isLegacySale(sale) {
  return Boolean(sale?.fulfillment_meta?.legacy_import);
}

/** True when qty/UOM must come only from the legacy line — never Centrix product packaging. */
export function isLegacySaleLine(line, { legacyPrint = false, sale = null } = {}) {
  if (legacyPrint) return true;
  if (line?.display_uom_mode === "legacy") return true;
  if (line?.legacy_line === true) return true;
  if (sale && isLegacySale(sale)) return true;
  return false;
}

/** UOM recorded on the legacy line itself — never infer Centrix product packaging. */
export function legacySaleLineUom(line) {
  const unit = String(line?.uom ?? line?.sold_uom ?? "").trim();
  return unit || null;
}

/** Legacy import lines — show stored quantity and UOM without Centrix conversion. */
export function legacySaleLineQtyLabel(line, qtyField = "quantity") {
  const qty = Number(line?.[qtyField] ?? line?.quantity ?? 0);
  const formatted = formatDisplayQty(qty);
  const unit = legacySaleLineUom(line);
  return unit ? `${formatted} ${unit}` : formatted;
}

/** Thermal receipt columns for legacy import lines. */
export function legacySaleLinePrintQtyPackage(line) {
  const baseQty = Number(line?.quantity ?? 0);
  return {
    quantity: formatDisplayQty(baseQty),
    package: legacySaleLineUom(line) ?? "",
  };
}

/** Display sale line quantity with packaging labels when UOM data is available. */
/** Unit price shown per pack (wholesale) or per retail measure — from stored line amount ÷ qty. */
export function saleLineDisplayUnitPrice(line, uomById, { legacyPrint = false, sale = null } = {}) {
  if (isLegacySaleLine(line, { legacyPrint, sale })) {
    const baseQty = Number(line?.quantity ?? 0);
    const amount = Number(line?.amount ?? 0);
    if (baseQty > 0 && amount > 0) {
      return Math.round((amount / baseQty) * 100) / 100;
    }
    return Number(line?.selling_price ?? line?.unit_price ?? 0);
  }

  const uom = saleLineUom(line, uomById);
  const isRetailLine = Number(line?.on_wholesale_retail) === 1;
  const factor = uomConversionFactor(uom);
  const baseQty = Number(line?.quantity ?? 0);
  const amount = Number(line?.amount ?? 0);

  if (baseQty > 0 && amount > 0) {
    const displayQty = isRetailLine || factor <= 1 ? baseQty : baseQty / factor;
    if (displayQty > 0) {
      return Math.round((amount / displayQty) * 100) / 100;
    }
  }

  return cartLineDisplayUnitPrice(
    { unit_price: line?.selling_price ?? line?.unit_price },
    uom,
    isRetailLine,
  );
}

function saleLineRetailPackage(line) {
  return (
    line?.product?.retail_package_setting ??
    line?.product?.retail_package ??
    line?.retail_package_setting ??
    null
  );
}

/**
 * Receipt / thermal print columns — unit price is reverse-computed from line amount ÷ qty
 * so wholesale line markups (on total, not per unit) display correctly.
 */
export function resolveSaleLinePrintColumns(
  line,
  { uom = null, retailPackage = null, legacyPrint = false } = {},
) {
  if (legacyPrint) {
    const baseQty = Number(line?.quantity ?? 0);
    const discount = Math.max(0, Number(line?.discount_given ?? 0));
    const amountAfterDisc = Number(line?.amount ?? 0);
    const amountBeforeDisc = amountAfterDisc + discount;
    const qty = baseQty > 0 ? baseQty : 0;
    const unitPrice = qty > 0 ? Math.round((amountBeforeDisc / qty) * 100) / 100 : 0;

    return {
      qty,
      unitPrice,
      basePrice: unitPrice,
      markup: 0,
      discount,
      amount: Math.round(amountAfterDisc * 100) / 100,
    };
  }

  const isRetail = Number(line?.on_wholesale_retail) === 1;
  const baseQty = Number(line?.quantity ?? 0);
  const factor = uomConversionFactor(uom);
  const discount = Math.max(0, Number(line?.discount_given ?? 0));
  const amountAfterDisc = Number(line?.amount ?? 0);
  const amountBeforeDisc = amountAfterDisc + discount;
  const catalogBase = Number(line?.product?.unit_price ?? 0);
  const packageSettings = retailPackage ?? saleLineRetailPackage(line);
  const tiers = tiersForRetailPackage(packageSettings);

  const qty = isRetail
    ? baseQty > 0
      ? baseQty
      : 0
    : factor > 1
      ? baseQty > 0
        ? baseQty / factor
        : 0
      : baseQty > 0
        ? baseQty
        : 0;

  const unitPrice =
    qty > 0 ? Math.round((amountBeforeDisc / qty) * 100) / 100 : 0;

  if (isRetail) {
    const basePrice =
      catalogBase > 0 ? wholesalePricePerSmallUnit(catalogBase, uom) : unitPrice;
    const markup =
      catalogBase > 0 && qty > 0
        ? Math.round((amountBeforeDisc - basePrice * qty) * 100) / 100
        : 0;

    return {
      qty,
      unitPrice,
      basePrice,
      markup,
      discount,
      amount: Math.round(amountAfterDisc * 100) / 100,
    };
  }

  let basePrice = 0;
  let markup = 0;

  if (catalogBase > 0 && qty > 0) {
    const wholesaleTiers = tiersWithPriceMode(tiers, "wholesale");
    const tier = tierForQuantity(wholesaleTiers, baseQty);
    const measureLevel = tier?.measure_level || (factor > 1 ? "full" : "small");
    basePrice = wholesalePriceAtMeasureLevel(catalogBase, uom, measureLevel);
    const baseTotal = Math.round(basePrice * qty * 100) / 100;
    markup = tier
      ? Number(tier.markup_price ?? 0)
      : Number(packageSettings?.wholesale_markup_price ?? 0);
    const expected = Math.round((baseTotal + markup) * 100) / 100;
    if (Math.abs(expected - amountBeforeDisc) > 0.02) {
      markup = Math.round((amountBeforeDisc - baseTotal) * 100) / 100;
    }
  } else if (qty > 0) {
    basePrice = amountBeforeDisc / qty;
  }

  return {
    qty,
    unitPrice,
    basePrice,
    markup,
    discount,
    amount: Math.round(amountAfterDisc * 100) / 100,
  };
}

export function saleLineQtyLabel(line, uomById, { legacyPrint = false, sale = null } = {}) {
  if (isLegacySaleLine(line, { legacyPrint, sale })) {
    return legacySaleLineQtyLabel(line);
  }

  const uom = saleLineUom(line, uomById);

  if (uom) {
    return formatPosCartQty(line?.quantity, uom);
  }

  if (line?.uom) {
    return `${line.quantity} ${line.uom}`;
  }

  return formatMixedStockDisplay(line?.quantity, 1).text;
}

/** Thermal receipt — quantity count and packaging label as separate right-aligned columns. */
export function saleLinePrintQtyPackage(line, uomById, { legacyPrint = false, sale = null } = {}) {
  if (isLegacySaleLine(line, { legacyPrint, sale })) {
    return legacySaleLinePrintQtyPackage(line);
  }

  const uom = saleLineUom(line, uomById);
  const baseQty = Number(line?.quantity ?? 0);

  if (uom) {
    const parts = splitBaseToHierarchy(baseQty, uom).filter((p) => p.qty > 0.0001);
    if (parts.length) {
      return {
        quantity: parts.map((p) => formatDisplayQty(p.qty)).join(", "),
        package: parts.map((p) => p.label).join(", "),
      };
    }
    const factor = uomConversionFactor(uom);
    return {
      quantity: formatDisplayQty(0),
      package: factor > 1 ? fullPackageLabel(uom) : smallPackagingLabel(uom),
    };
  }

  if (line?.uom) {
    return {
      quantity: formatDisplayQty(baseQty),
      package: String(line.uom),
    };
  }

  const fallback = formatMixedStockDisplay(baseQty, 1);
  return {
    quantity: formatDisplayQty(fallback.display),
    package: fallback.unit,
  };
}

/** Build { [product_code]: product } from /products list response. */
export function indexProductsByCode(products) {
  const map = {};
  for (const p of products ?? []) {
    if (p?.product_code) map[p.product_code] = p;
  }
  return map;
}
