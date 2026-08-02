import {
  linePrice,
  linePriceForTier,
  normalizeTierPriceMode,
  tierForQuantity,
  tiersForRetailPackage,
  tiersWithPriceMode,
  wholesalePricePerSmallUnit,
  wholesaleTierBaseAtMeasureLevel,
} from "@/lib/retail-pricing";
import { formatSaleKes } from "@/lib/sales";
import {
  baseToDisplayQty,
  displayToBaseQty,
  formatDisplayQty,
  formatPosCartQty,
  uomConversionFactor,
} from "@/lib/stock-uom";
import {
  fullPackageLabel,
  measureLevelLabel,
  smallPackagingLabel,
  uomIsFullPackageOnly,
  uomSmallUnitIsWholeNumber,
} from "@/lib/uom-packaging";
import { finalizePosLineAmount } from "@/lib/pos-cash-round";

/** POS session is selling at retail when the cashier toggles it on. */
export function isPosRetailSession(sellWholesale) {
  return !sellWholesale;
}

/** Product has retail package tiers configured. */
export function productHasRetailTiers(retailPackage) {
  return tiersForRetailPackage(retailPackage).length > 0;
}

/** Retail tier pricing applies for this product in the current POS session. */
export function usesPosRetailPricing(sellWholesale, product, retailPackage) {
  return isPosRetailSession(sellWholesale) && productHasRetailTiers(retailPackage);
}

/** Default POS quantity: 1 wholesale pack or 1 small unit in retail session. */
export function defaultPosEntryQty(product, sellWholesale, retailPackage = null) {
  return "1";
}

function formatTierRange(tier, smallLabel) {
  const to = tier.max_qty == null ? "∞" : tier.max_qty;
  return `${tier.min_qty}–${to} ${smallLabel}`;
}

/**
 * Label + hint for the single quantity field (cashier never picks package manually).
 */
export function posQuantityFieldMeta(
  product,
  sellWholesale,
  retailPackage = null,
  entryQty = "1",
) {
  const uom = product?.uom ?? null;
  const factor = uomConversionFactor(uom);
  const retailPricing = usesPosRetailPricing(sellWholesale, product, retailPackage);
  const tiers = tiersForRetailPackage(retailPackage, uom);

  if (isPosRetailSession(sellWholesale) && !product) {
    return {
      label: "Quantity",
      unit: "",
      hint: "Select a product — retail tier sets the selling unit and price",
      step: "any",
    };
  }

  if (isPosRetailSession(sellWholesale) && product && !tiers.length) {
    const small = smallPackagingLabel(uom);
    return {
      label: `Quantity (${small})`,
      unit: small,
      hint: "No retail tiers for this product — wholesale pricing applies",
      step: uomSmallUnitIsWholeNumber(uom) ? "1" : "any",
    };
  }

  if (!retailPricing) {
    const fullOnly = uomIsFullPackageOnly(uom);
    const unit = fullOnly || factor > 1 ? fullPackageLabel(uom) : smallPackagingLabel(uom);
    const small = smallPackagingLabel(uom);
    return {
      label: `Quantity (${unit})`,
      unit,
      hint: fullOnly
        ? `Wholesale — count in ${unit} only`
        : factor > 1
          ? `Wholesale — each count is 1 ${unit}; stock is recorded in ${small}`
          : `Wholesale — count in ${unit}`,
      step: uomSmallUnitIsWholeNumber(uom) || fullOnly ? "1" : "any",
    };
  }

  const small = smallPackagingLabel(uom);
  const qty = Math.max(0, Number(entryQty) || 0);
  const tierQty = qty > 0 ? qty : 1;
  const tier = tierForQuantity(tiers, qty) ?? tierForQuantity(tiers, tierQty);
  const sellUnit = tier
    ? measureLevelLabel(uom, tier.measure_level || "small")
    : small;

  return {
    label: `Quantity (${small})`,
    unit: small,
    hint: tier
      ? `Retail tier ${formatTierRange(tier, small)} → sold as ${sellUnit}`
      : `Retail — enter ${small}; stock is recorded in ${small}`,
    step: uomSmallUnitIsWholeNumber(uom) ? "1" : "any",
  };
}

/**
 * Resolve a single cashier quantity into base stock units, wholesale pack qty,
 * retail tier, and the measure level / package label to show.
 *
 * `baseQty` is always in the smallest UOM (kg, pcs, …) — this is what cart lines,
 * sales, and stock ledger use. Display labels (e.g. "1 bag") are derived from baseQty.
 *
 * F12 retail session: the number the cashier types is always small units (never × factor).
 * Wholesale session: the number is full packs when conversion_factor > 1.
 */
export function resolvePosQuantity(entryQty, product, retailPackage, sellWholesale) {
  const uom = product?.uom ?? null;
  const factor = uomConversionFactor(uom);
  const qty = Math.max(0, Number(entryQty) || 0);
  const tiers = tiersForRetailPackage(retailPackage, uom);
  const retailSession = isPosRetailSession(sellWholesale);

  // Retail / kg mode: keep the typed qty as-is in small units (do not × conversion).
  // Applies even when the product has no retail tiers — otherwise F12 retail still
  // treated entry as wholesale packs and multiplied by conversion_factor.
  if (retailSession) {
    const baseQty = qty;
    const packQty = factor > 1 ? baseToDisplayQty(baseQty, factor) : qty;
    const tierExact = tierForQuantity(tiers, qty);
    const tierQty = qty > 0 ? qty : 1;
    const activeTier =
      tierExact ??
      (tiers.length > 0
        ? tierForQuantity(tiers, tierQty, { extendPastMax: true })
        : null);

    if (!activeTier) {
      return {
        baseQty,
        packQty,
        measureLevel: "small",
        packagingLabel: measureLevelLabel(uom, "small"),
        tier: null,
        isRetail: true,
        pricingRetail: false,
        retailSession: true,
      };
    }

    const measureLevel = activeTier.measure_level || "small";
    // Past the last capped tier (e.g. 75kg when max is 50) still retail-prices with
    // accumulated markup — same extendPastMax behaviour as linePrice().
    const inRetailPricing = Boolean(activeTier);
    return {
      baseQty,
      packQty,
      measureLevel,
      packagingLabel: measureLevelLabel(uom, measureLevel),
      tier: activeTier,
      isRetail: true,
      pricingRetail: inRetailPricing,
      retailSession: true,
    };
  }

  // Wholesale session: entry is pack count when conversion_factor > 1.
  const packQty = qty;
  const fullOnly = uomIsFullPackageOnly(uom);
  const baseQty = fullOnly || factor <= 1 ? qty : displayToBaseQty(qty, factor);
  const wholesaleTiers = tiersWithPriceMode(tiers, "wholesale");
  const tier = tierForQuantity(wholesaleTiers, baseQty);
  const measureLevel =
    tier?.measure_level || (fullOnly || factor > 1 ? "full" : "small");
  return {
    baseQty,
    packQty,
    measureLevel,
    packagingLabel: measureLevelLabel(uom, measureLevel),
    tier,
    isRetail: false,
    pricingRetail: false,
    retailSession: false,
  };
}

function isRetailRouteLine(sellWholesale, retailLine) {
  if (retailLine != null) return Boolean(retailLine);
  return isPosRetailSession(sellWholesale);
}

function applyRouteMarkupToLine({
  lineAmount,
  routeMarkupPerUnit,
  sellWholesale,
  retailLine,
  packQty,
  baseQty,
}) {
  const routeMarkup = Math.max(0, Number(routeMarkupPerUnit ?? 0));
  if (routeMarkup <= 0 || baseQty <= 0) {
    return lineAmount;
  }

  if (isRetailRouteLine(sellWholesale, retailLine)) {
    return lineAmount + routeMarkup;
  }

  const wholesaleQty = Math.max(0, Number(packQty) || Number(baseQty) || 0);
  return lineAmount + routeMarkup * wholesaleQty;
}

/**
 * Derive the unit price shown in POS / receipts.
 * Retail: always per small unit (kg). Do not scale by pack measure level — that
 * baked markup into a pack-sized "unit" and made totals look like unit×qty with
 * markup inside the unit. Wholesale packs: per pack from line amount.
 */
export function reversePosDisplayUnitPrice(
  lineAmount,
  uom,
  { retailSession, factor, baseQty, packQty, measureLevel },
) {
  const amount = Number(lineAmount ?? 0);
  if (amount <= 0) return 0;

  if (!retailSession && factor > 1 && packQty > 0) {
    return amount / packQty;
  }

  // Retail (and simple UOMs): per small / base unit from the priced amount.
  if (baseQty > 0) {
    return amount / baseQty;
  }

  return amount;
}

/**
 * Cashier-facing retail unit price: catalog wholesale per small unit only.
 * Tier / route markups stay on the line amount — never folded into this unit.
 */
export function retailDisplayWholesaleUnitPrice(catalogUnitPrice, uom) {
  return Math.round(wholesalePricePerSmallUnit(catalogUnitPrice, uom) * 100) / 100;
}

/** Unit price field label — retail/markup/route breakdown when applicable. */
export function posUnitPriceFieldLabel(
  product,
  sellWholesale,
  retailPackage = null,
  entryQty = "1",
  routeMarkupPerUnit = 0,
  retailLine = null,
) {
  const base = "Unit price";
  if (!product) return base;

  const uom = product?.uom ?? null;
  const resolved = resolvePosQuantity(entryQty, product, retailPackage, sellWholesale);
  const routeMarkup = Math.max(0, Number(routeMarkupPerUnit ?? 0));
  const retailRouteLine = isRetailRouteLine(sellWholesale, retailLine);
  const parts = [];

  if (usesPosRetailPricing(sellWholesale, product, retailPackage) && resolved.tier && resolved.pricingRetail) {
    const wholesalePerSmall = wholesalePricePerSmallUnit(Number(product.unit_price ?? 0), uom);
    parts.push(`Wholesale ${formatSaleKes(wholesalePerSmall)}`);
    const markup = Number(resolved.tier.markup_price ?? 0);
    if (markup > 0) {
      parts.push(`Amount markup ${formatSaleKes(markup)}`);
    }
  } else if (resolved.tier && normalizeTierPriceMode(resolved.tier) === "wholesale") {
    const wholesaleAtLevel = wholesaleTierBaseAtMeasureLevel(
      Number(product.unit_price ?? 0),
      resolved.tier,
      uom,
    );
    parts.push(`Wholesale ${formatSaleKes(wholesaleAtLevel)}`);
    const markup = Number(resolved.tier.markup_price ?? 0);
    if (markup > 0) {
      parts.push(`Line markup ${formatSaleKes(markup)}`);
    }
  } else if (!isPosRetailSession(sellWholesale)) {
    const factor = uomConversionFactor(uom);
    const wholesaleMarkup = Number(retailPackage?.wholesale_markup_price ?? 0);
    const catalogUnitPrice = Number(product.unit_price ?? 0);
    if (factor > 1) {
      parts.push(`Catalog ${formatSaleKes(catalogUnitPrice)} / pack`);
      if (wholesaleMarkup > 0) {
        parts.push(`Line markup ${formatSaleKes(wholesaleMarkup)}`);
      }
    } else if (wholesaleMarkup > 0) {
      parts.push(`Line markup ${formatSaleKes(wholesaleMarkup)}`);
    }
  }

  if (routeMarkup > 0) {
    parts.push(
      retailRouteLine
        ? `Route markup ${formatSaleKes(routeMarkup)}`
        : `Route markup ${formatSaleKes(routeMarkup)} / unit`,
    );
  }

  if (parts.length === 0) return base;
  return `${base} (${parts.join(" + ")})`;
}

/**
 * Convert cashier sale qty to base (smallest UOM) for cart lines and stock ledger.
 * Wholesale: entry is in full packs when conversion_factor > 1. Retail: entry is in small units.
 */
export function posEntryToBaseQty(entryQty, product, sellWholesale, retailPackage = null) {
  return resolvePosQuantity(entryQty, product, retailPackage, sellWholesale).baseQty;
}

/** Label for stock that will be deducted — smallest UOM plus packaging equivalent when applicable. */
export function posStockDeductionHint(entryQty, product, sellWholesale, retailPackage = null) {
  const uom = product?.uom ?? null;
  if (!uom) return null;
  const baseQty = posEntryToBaseQty(entryQty, product, sellWholesale, retailPackage);
  if (baseQty <= 0) return null;
  const small = smallPackagingLabel(uom);
  const baseText = `${formatDisplayQty(baseQty)} ${small}`;
  const packText = formatPosCartQty(baseQty, uom);
  const factor = uomConversionFactor(uom);

  if (factor <= 1 || packText === baseText) {
    return `Stock deducts ${baseText}`;
  }

  return `Stock deducts ${baseText} equal to ${packText}`;
}

/**
 * Compute POS line totals using catalog UOM + retail package settings.
 * `baseQty` (smallest UOM) is sent to the API for cart lines and stock deduction.
 */
export function computePosLine({
  product,
  entryQty = "1",
  sellWholesale,
  retailPackage = null,
  discount = 0,
  unitPriceOverride = null,
  routeMarkupPerUnit = 0,
  retailLine = null,
  cashRound = false,
}) {
  const uom = product?.uom ?? null;
  const factor = uomConversionFactor(uom);
  const resolved = resolvePosQuantity(entryQty, product, retailPackage, sellWholesale);
  const { baseQty, packQty, pricingRetail, retailSession } = resolved;
  const catalogUnitPrice = Number(product?.unit_price ?? 0);
  const tiers = tiersForRetailPackage(retailPackage, uom);
  const wholesaleMarkup = Number(retailPackage?.wholesale_markup_price ?? 0);

  let lineAmount;
  const override =
    unitPriceOverride != null && Number(unitPriceOverride) > 0
      ? Number(unitPriceOverride)
      : null;

  if (override != null && retailSession && resolved.tier && pricingRetail && baseQty > 0) {
    // Override is wholesale per small unit; markup still accumulates on amount.
    // e.g. 125/kg × 25kg + 30 = 3155 (never 130×25 with markup inside the unit).
    const catalogFromOverride = factor > 1 ? override * factor : override;
    lineAmount = linePrice(catalogFromOverride, tiers, baseQty, true, uom);
  } else if (override != null) {
    if (retailSession || factor <= 1) {
      lineAmount = baseQty * override;
    } else {
      lineAmount = packQty * override;
    }
  } else if (retailSession && resolved.tier) {
    if (pricingRetail && baseQty > 0) {
      lineAmount = linePrice(catalogUnitPrice, tiers, baseQty, true, uom);
    } else if (baseQty > 0) {
      lineAmount = wholesalePricePerSmallUnit(catalogUnitPrice, uom) * baseQty;
    } else {
      lineAmount = 0;
    }
  } else if (resolved.tier) {
    lineAmount = linePriceForTier(catalogUnitPrice, resolved.tier, baseQty, uom);
  } else {
    lineAmount = packQty * catalogUnitPrice + wholesaleMarkup;
  }

  lineAmount = applyRouteMarkupToLine({
    lineAmount,
    routeMarkupPerUnit,
    sellWholesale,
    retailLine,
    packQty,
    baseQty,
  });

  const lineAmountBeforeDiscount = lineAmount;
  const discountNum = Math.max(0, Number(discount ?? 0));
  lineAmount = Math.max(0, lineAmount - discountNum);

  // Retail Price field: wholesale per kg only. Markup lives on amount.
  // Wholesale: pack unit from priced amount (includes flat line markup).
  const displayUnitPrice =
    retailSession && pricingRetail
      ? override != null
        ? Math.round(override * 100) / 100
        : retailDisplayWholesaleUnitPrice(catalogUnitPrice, uom)
      : reversePosDisplayUnitPrice(lineAmountBeforeDiscount, uom, {
          retailSession,
          factor,
          baseQty,
          packQty,
          measureLevel: resolved.measureLevel,
        });
  const roundedLineAmount = finalizePosLineAmount(lineAmount, { cashRound });
  // Per-base average for API trust path (amount ÷ qty); includes markup share.
  const unitPricePerBase = baseQty > 0 ? roundedLineAmount / baseQty : 0;

  return {
    ...resolved,
    lineAmountBeforeDiscount: Math.round(lineAmountBeforeDiscount * 100) / 100,
    discountApplied: Math.round(discountNum * 100) / 100,
    lineAmount: roundedLineAmount,
    displayUnitPrice: Math.round(displayUnitPrice * 100) / 100,
    unitPricePerBase: Math.round(unitPricePerBase * 10000) / 10000,
    qtyLabel: retailSession
      ? `${formatDisplayQty(baseQty)} ${smallPackagingLabel(uom)}`
      : factor > 1
        ? `${formatDisplayQty(packQty)} ${fullPackageLabel(uom)}`
        : formatPosCartQty(baseQty, uom),
    uomLabel: resolved.packagingLabel,
  };
}

/** Unit price shown in product search for the current POS pricing mode. */
export function posListUnitPrice(product, sellWholesale, retailPackage) {
  if (!product?.uom) {
    return Number(product?.unit_price ?? 0);
  }
  const { displayUnitPrice } = computePosLine({
    product,
    entryQty: "1",
    sellWholesale,
    retailPackage,
    discount: 0,
  });
  return displayUnitPrice;
}

/** Per-unit discount from stored line total (`discount_given` ÷ pack/display qty). */
export function lineDiscountPerUnit(totalDiscount, packQty) {
  const q = Number(packQty);
  const total = Math.max(0, Number(totalDiscount ?? 0));
  if (!Number.isFinite(q) || q <= 0) return total;
  return Math.round((total / q) * 10000) / 10000;
}

/** Line total discount for API from per-unit cashier input × pack/display qty. */
export function lineDiscountTotal(perUnitDiscount, packQty) {
  const q = Number(packQty);
  const perUnit = Math.max(0, Number(perUnitDiscount ?? 0));
  if (!Number.isFinite(q) || q <= 0) return 0;
  return Math.round(perUnit * q * 100) / 100;
}

/**
 * Cart grid unit price for the sold unit (bag / kg / pcs).
 * Prefer `display_unit_price` — it is already per cashier-facing unit.
 * Never scale API `unit_price` by conversion again: PosLinePricingService stores
 * wholesale `unit_price` as amount ÷ pack qty (per bag), so multiplying by factor
 * inflated the UI (e.g. 6,250 × 50 = 312,500) while amount/receipts stayed correct.
 */
export function cartLineDisplayUnitPrice(line, uom, isRetailLine = false) {
  const storedDisplay = Number(line?.display_unit_price);
  if (Number.isFinite(storedDisplay) && storedDisplay > 0) {
    return storedDisplay;
  }

  const amount = Number(line?.amount ?? 0);
  const discount = Math.max(0, Number(line?.discount_given ?? 0));
  const baseQty = Number(line?.quantity ?? 0);
  const factor = uomConversionFactor(uom);
  const soldQty =
    !isRetailLine && factor > 1 && baseQty > 0
      ? baseToDisplayQty(baseQty, factor)
      : baseQty;

  if (soldQty > 0 && (amount > 0 || discount > 0)) {
    return Math.round(((amount + discount) / soldQty) * 100) / 100;
  }

  // Offline/optimistic lines may still hold per-base unit_price before display is set.
  const stored = Number(line?.unit_price ?? 0);
  if (!isRetailLine && factor > 1 && Number.isFinite(stored) && stored > 0) {
    const asPack = Math.round(stored * factor * 100) / 100;
    const asBaseTimesQty = Math.round(stored * baseQty * 100) / 100;
    // Per-base local lines: unit × baseQty ≈ amount; scale to pack for the grid.
    if (amount > 0 && Math.abs(asBaseTimesQty - amount) <= Math.max(0.02, amount * 0.001)) {
      return asPack;
    }
  }

  return Number.isFinite(stored) ? stored : 0;
}

/** Rebuild POS entry quantity from a saved cart line (base qty in DB). */
export function posEntryQtyFromCartLine(line, product, retailPackage) {
  const uom = product?.uom ?? null;
  const factor = uomConversionFactor(uom);
  const baseQty = Number(line?.quantity ?? 0);
  const isRetailLine = Number(line?.on_wholesale_retail) === 1;

  if (isRetailLine && productHasRetailTiers(retailPackage)) {
    return String(baseQty);
  }
  if (factor > 1 && !isRetailLine) {
    return String(baseToDisplayQty(baseQty, factor));
  }
  return String(baseQty);
}

/** Unit label for the editable cart-line qty (matches `posEntryQtyFromCartLine` unit). */
export function posCartLineEntryUnitLabel(line, product, retailPackage) {
  const uom = product?.uom ?? null;
  if (uom) {
    const factor = uomConversionFactor(uom);
    const isRetailLine = Number(line?.on_wholesale_retail) === 1;
    if (factor > 1 && !isRetailLine) {
      return fullPackageLabel(uom);
    }
    return smallPackagingLabel(uom);
  }
  const fallback =
    line?.package_label ||
    line?.uom_name ||
    (typeof line?.uom === "string" ? line.uom : "") ||
    product?.packaging_label ||
    "";
  return String(fallback).trim();
}

/** Rebuild POS entry quantity from a base (stock) quantity. */
export function posEntryQtyFromBaseQty(baseQty, product, retailPackage, isRetailLine) {
  return posEntryQtyFromCartLine(
    { quantity: baseQty, on_wholesale_retail: isRetailLine ? 1 : 0 },
    product,
    retailPackage,
  );
}

/** Short label for retail vs wholesale on cart rows. */
export function posCartLineTypeLabel(line) {
  return Number(line?.on_wholesale_retail) === 1 ? "Retail" : "Wholesale";
}

/**
 * Refresh open cart line prices from the current product catalog.
 * Returns updated cart + count of lines whose unit price changed.
 */
export function applyCatalogPricesToCart(
  cart,
  { productByCode = {}, retailByCode = {}, sellWholesale = false } = {},
) {
  if (!cart?.lines?.length) {
    return { cart, updatedCount: 0, changes: [] };
  }

  const changes = [];
  const lines = (cart.lines ?? []).map((line) => {
    if (!line?.product_code) return line;
    const product = productByCode[line.product_code];
    if (!product) return line;

    const retailPackage = retailByCode?.[line.product_code] ?? null;
    const computed = computePosLine({
      product,
      entryQty: posEntryQtyFromCartLine(line, product, retailPackage),
      sellWholesale,
      retailPackage,
      discount: Number(line.discount_given ?? 0),
    });
    const nextUnit = computed.unitPricePerBase;
    const nextDisplay = computed.displayUnitPrice;
    const prevUnit = Number(line.unit_price ?? 0);
    const prevDisplay = Number(line.display_unit_price ?? prevUnit);

    if (
      Math.abs(nextUnit - prevUnit) < 0.009 &&
      Math.abs(nextDisplay - prevDisplay) < 0.009
    ) {
      return line;
    }

    changes.push({
      product_code: line.product_code,
      product_name: line.product_name ?? product.product_name ?? line.product_code,
      from: prevDisplay,
      to: nextDisplay,
    });

    return {
      ...line,
      unit_price: nextUnit,
      display_unit_price: nextDisplay,
      amount: computed.lineAmount,
      product_vat: line.product_vat != null ? line.product_vat : undefined,
    };
  });

  return {
    cart: { ...cart, lines },
    updatedCount: changes.length,
    changes,
  };
}
