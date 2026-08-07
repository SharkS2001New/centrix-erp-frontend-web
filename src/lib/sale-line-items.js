import { lineDiscountPerUnit, lineDiscountTotal, posEntryQtyFromCartLine, posEntryToBaseQty } from "@/lib/pos-line";
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
  formatSaleLineQtyDisplay,
  saleLineQtyPartsForPrint,
  uomConversionFactor,
} from "@/lib/stock-uom";

export function saleLineUom(line, uomById) {
  const unitId = line?.product?.unit_id ?? line?.unit_id ?? null;
  if (unitId != null && uomById?.get) {
    const fromMap = uomById.get(unitId);
    if (fromMap) return fromMap;
  }
  // Nested product.unit / offline line.unit snapshot — never drop these when the map misses.
  return line?.product?.unit ?? line?.product?.uom ?? line?.unit ?? null;
}

/**
 * Attach product.unit (conversion factor + pack labels) so receipts can show
 * "1 bag" instead of raw base qty "25 bag" when 1 bag = 25 kg.
 */
export function snapshotUomForPrint(uom) {
  if (!uom || typeof uom !== "object") return null;
  return {
    id: uom.id ?? null,
    conversion_factor: Number(uom.conversion_factor ?? 1) || 1,
    full_name: uom.full_name ?? null,
    measure_name: uom.measure_name ?? null,
    small_packaging_label: uom.small_packaging_label ?? null,
    middle_packaging_label: uom.middle_packaging_label ?? null,
    middle_factor: uom.middle_factor ?? null,
    uses_small_packaging: uom.uses_small_packaging,
    uom_type: uom.uom_type ?? null,
  };
}

export function enrichSaleLinesForQtyPrint(sale, { productByCode = null, uomById = null } = {}) {
  const items = Array.isArray(sale?.items) ? sale.items : [];
  if (!items.length) return sale;

  const nextItems = items.map((line) => {
    if (saleLineUom(line, uomById)) return line;

    const fromCatalog = productByCode?.[line?.product_code] ?? null;
    const unit =
      fromCatalog?.uom ??
      fromCatalog?.unit ??
      line?.unit ??
      null;
    const unitId =
      fromCatalog?.unit_id ??
      unit?.id ??
      line?.unit_id ??
      line?.product?.unit_id ??
      null;

    if (!unit && unitId == null) return line;

    const resolvedUnit =
      unit ??
      (unitId != null && uomById?.get ? uomById.get(unitId) : null);
    if (!resolvedUnit) return line;

    return {
      ...line,
      unit: resolvedUnit,
      unit_id: unitId ?? resolvedUnit.id ?? line.unit_id ?? null,
      product: {
        ...(line.product ?? {}),
        product_code: line.product_code ?? line.product?.product_code,
        product_name:
          line.product_name ??
          line.product?.product_name ??
          fromCatalog?.product_name ??
          null,
        unit_id: unitId ?? resolvedUnit.id ?? line.product?.unit_id ?? null,
        unit: resolvedUnit,
      },
    };
  });

  return { ...sale, items: nextItems };
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

/** Pack/display qty used when converting stored line discount ↔ cashier-entered per-unit discount. */
export function saleLinePackQtyForDiscount(line, uomById, retailByCode = {}, draftQty = null) {
  if (draftQty != null && draftQty !== "") {
    const parsed = Number(draftQty);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  const entry = Number(saleLineEntryQtyForEdit(line, uomById, retailByCode));
  if (Number.isFinite(entry) && entry > 0) return entry;
  const fallback = Number(line?.quantity ?? 0);
  return fallback > 0 ? fallback : 1;
}

/** Cashier-entered per-pack discount from API line-total `discount_given`. */
export function saleLineEnteredDiscountPerUnit(line, uomById, retailByCode = {}, draftQty = null) {
  return lineDiscountPerUnit(
    line.discount_given,
    saleLinePackQtyForDiscount(line, uomById, retailByCode, draftQty),
  );
}

/** Line-total discount for API from per-pack cashier input. */
export function saleLineDiscountTotalFromEntered(perUnit, line, draftQty, uomById, retailByCode = {}) {
  return lineDiscountTotal(
    perUnit,
    saleLinePackQtyForDiscount(line, uomById, retailByCode, draftQty),
  );
}

/** Pack/display qty for cart line discount display (POS). */
export function cartLinePackQtyForDiscount(line, product, retailPackage) {
  const fromEntry = Number(posEntryQtyFromCartLine(line, product, retailPackage));
  if (Number.isFinite(fromEntry) && fromEntry > 0) return fromEntry;
  const fallback = Number(line?.quantity ?? 0);
  return fallback > 0 ? fallback : 1;
}

/** Cashier-entered per-pack discount for a cart line. */
export function cartLineEnteredDiscountPerUnit(line, product, retailPackage) {
  return lineDiscountPerUnit(line.discount_given, cartLinePackQtyForDiscount(line, product, retailPackage));
}

/** Product display name from nested API relation, flat line fields, or a code → product map. */
export function saleLineProductName(line, productByCode) {
  const fromRelation = line?.product?.product_name;
  if (fromRelation) return fromRelation;
  // Offline / queued sales store the name on the line (no nested product).
  const fromLine = String(line?.product_name ?? line?.description ?? "").trim();
  if (fromLine) return fromLine;
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
/** Gross unit price per sold pack/display unit — reverse from line total ÷ qty (whole KES).
 * Mobile route markup (and retail tier add-ons) sit on the line amount, not the catalog
 * unit — so PRICE must be amount÷qty, never the bare wholesale/kg from the product card.
 */
export function saleLineSoldUnitPrice(line, uomById, retailByCode = {}) {
  const amount = Number(line?.amount ?? line?.display_amount ?? 0);
  const discount = Math.max(0, Number(line?.discount_given ?? 0));
  const packQty = saleLinePackQtyForDiscount(line, uomById, retailByCode);
  if (packQty > 0 && (amount > 0 || discount > 0)) {
    // e.g. retail 25 kg line 3,465 (includes route markup) → 139 / kg
    return Math.round((amount + discount) / packQty);
  }

  if (line?.display_unit_price != null && line.display_unit_price !== "") {
    const fromApi = Number(line.display_unit_price);
    if (Number.isFinite(fromApi) && fromApi >= 0) return Math.round(fromApi);
  }

  const stored = Number(line?.selling_price ?? line?.unit_price ?? 0);
  return Number.isFinite(stored) && stored > 0 ? Math.round(stored) : 0;
}

/** @deprecated Use {@link saleLineSoldUnitPrice} for order line tables. */
export function saleLineCatalogDisplayUnitPrice(line, uomById) {
  return saleLineSoldUnitPrice(line, uomById);
}

/** Unit price column for saved order lines. */
export function saleLineDisplayUnitPrice(line, uomById) {
  return saleLineSoldUnitPrice(line, uomById);
}

/** Per-pack discount shown in order line tables (matches POS cashier input). */
export function saleLineDisplayDiscountPerUnit(line, uomById, retailByCode = {}, draftQty = null) {
  if (draftQty == null && line?.display_discount_per_unit != null && line.display_discount_per_unit !== "") {
    const fromApi = Number(line.display_discount_per_unit);
    if (Number.isFinite(fromApi) && fromApi >= 0) return fromApi;
  }
  return saleLineEnteredDiscountPerUnit(line, uomById, retailByCode, draftQty);
}

/** Line amount for order lists — stored net amount from the sale line (DB). */
export function saleLineListRowAmount(line) {
  if (line?.display_amount != null && line.display_amount !== "") {
    const fromApi = Number(line.display_amount);
    if (Number.isFinite(fromApi)) return fromApi;
  }
  return Number(line?.amount ?? 0);
}

/** Preview line amount while editing — scales stored amount/discount, never catalogue price. */
export function saleLinePreviewRowAmount(
  line,
  draftQty,
  uomById,
  { retailByCode = {}, draftDiscount = null, discountEditEnabled = false } = {},
) {
  const oldBase = Number(line.quantity ?? 0);
  const newBase = saleLineEntryQtyToBase(line, draftQty, uomById, retailByCode);
  const oldAmount = Number(line.amount ?? 0);
  const oldDiscount = Math.max(0, Number(line.discount_given ?? 0));

  if (!oldBase || !newBase) return oldAmount;

  if (!discountEditEnabled) {
    return Math.max(0, Math.round((oldAmount * newBase) / oldBase * 100) / 100);
  }

  const packQty = saleLinePackQtyForDiscount(line, uomById, retailByCode, draftQty);
  const grossBeforeDiscount =
    Math.round(((oldAmount + oldDiscount) * newBase) / oldBase * 100) / 100;
  const perPackDiscount = Math.max(0, Number(draftDiscount ?? line.draftDiscount ?? 0));
  const discountTotal = lineDiscountTotal(perPackDiscount, packQty);
  return Math.max(0, Math.round((grossBeforeDiscount - discountTotal) * 100) / 100);
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
    const unitPrice = qty > 0 ? Math.round(amountBeforeDisc / qty) : 0;

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
  const tiers = tiersForRetailPackage(packageSettings, uom);

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
    qty > 0 ? Math.round(amountBeforeDisc / qty) : 0;

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

export function saleLineQtyLabel(
  line,
  uomById,
  { legacyPrint = false, sale = null, showFullPackageUomOnDocuments = false } = {},
) {
  if (isLegacySaleLine(line, { legacyPrint, sale })) {
    return legacySaleLineQtyLabel(line);
  }

  const uom = saleLineUom(line, uomById);
  const isRetailLine = Number(line?.on_wholesale_retail) === 1;

  if (uom) {
    return formatSaleLineQtyDisplay(line?.quantity, uom, {
      isRetailLine,
      showFullPackageUomOnDocuments,
    });
  }

  if (line?.uom) {
    return `${formatDisplayQty(line.quantity)} ${line.uom}`;
  }

  return formatMixedStockDisplay(line?.quantity, 1).text;
}

/** Thermal receipt — quantity count and packaging label for a single QTY cell. */
export function saleLinePrintQtyPackage(
  line,
  uomById,
  { legacyPrint = false, sale = null, showFullPackageUomOnDocuments = false } = {},
) {
  if (isLegacySaleLine(line, { legacyPrint, sale })) {
    return legacySaleLinePrintQtyPackage(line);
  }

  const uom = saleLineUom(line, uomById);
  const baseQty = Number(line?.quantity ?? 0);
  const isRetailLine = Number(line?.on_wholesale_retail) === 1;

  if (uom) {
    return saleLineQtyPartsForPrint(baseQty, uom, {
      isRetailLine,
      showFullPackageUomOnDocuments,
    });
  }

  // Without conversion metadata, never pair base qty with a pack label ("350 bag").
  // Base units stay labeled neutrally; pack conversion requires line.unit / product.unit.
  if (line?.uom) {
    return {
      quantity: formatDisplayQty(baseQty),
      package: "units",
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
