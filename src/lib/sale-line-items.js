import { cartLineDisplayUnitPrice } from "@/lib/pos-line";
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

/** Display sale line quantity with packaging labels when UOM data is available. */
/** Unit price shown per pack (wholesale) or per retail measure — from stored line amount ÷ qty. */
export function saleLineDisplayUnitPrice(line, uomById) {
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
export function resolveSaleLinePrintColumns(line, { uom = null, retailPackage = null } = {}) {
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

export function saleLineQtyLabel(line, uomById) {
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
export function saleLinePrintQtyPackage(line, uomById) {
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
