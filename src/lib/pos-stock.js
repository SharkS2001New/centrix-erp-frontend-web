/** Whether a POS line counts as retail for shop/store stock routing. */
import {
  baseToDisplayQty,
  formatDisplayQty,
  formatMixedStockDisplay,
  uomConversionFactor,
} from "./stock-uom";
import {
  fullPackageLabel,
  smallPackagingLabel,
} from "./uom-packaging";
import { posEntryQtyFromBaseQty, usesPosRetailPricing } from "./pos-line";

export function posLineIsRetail(product, onWholesaleRetail) {
  return Boolean(product?.sell_on_retail) && Boolean(onWholesaleRetail);
}

export function productSellsRetail(product) {
  const value = product?.sell_on_retail;
  return value === true || value === 1 || value === "1";
}

/** Match SaleStockLocationResolver::stockRouteAsRetail — shop only when product sells retail AND line is retail-routed. */
export function saleLineStockAsRetail(product, onWholesaleRetailFlag) {
  return productSellsRetail(product) && Boolean(onWholesaleRetailFlag);
}

/**
 * Retail-side flag for stock routing (shop vs store).
 * Per-line routing: retail session + product sells retail → shop; otherwise store.
 */
export function posLineRetailStockFlag(posSalesConfig, sellWholesale, computedIsRetail, product) {
  if (posSalesConfig.perLineStockRouting) {
    return saleLineStockAsRetail(product, sellWholesale === false);
  }
  return Boolean(computedIsRetail);
}

export function cartLineRetailStockFlag(line) {
  return Number(line?.on_wholesale_retail) === 1;
}

function cartLineByRef(cartLines, lineRef) {
  if (lineRef == null || !cartLines?.length) return null;
  const ref = String(lineRef);
  return (
    cartLines.find(
      (line) => String(line.id) === ref || String(line.update_code ?? "") === ref,
    ) ?? null
  );
}

function lineMatchesRef(line, lineRef) {
  if (lineRef == null) return false;
  const ref = String(lineRef);
  return String(line.id) === ref || String(line.update_code ?? "") === ref;
}

/** Qty already reserved server-side for the line being edited (skip optimistic/pending lines). */
function reservedQtyForExcludedLine(cartLines, excludeLineId) {
  const line = cartLineByRef(cartLines, excludeLineId);
  if (!line || line._optimistic) return 0;
  return Number(line.quantity ?? 0);
}

/** Shop vs store routing for an existing cart line. */
export function cartLineStockAsRetail(line, product) {
  return saleLineStockAsRetail(product, cartLineRetailStockFlag(line));
}

/** One +/- click changes quantity by this many base (stock) units. */
export function cartLineQuantityStep(product, line, retailPackage = null) {
  const isRetailLine = cartLineRetailStockFlag(line);
  const factor = uomConversionFactor(product?.uom);
  if (isRetailLine || factor <= 1) {
    return 1;
  }
  return factor;
}

export function cartLineNextBaseQty(line, product, retailPackage, delta) {
  const step = cartLineQuantityStep(product, line, retailPackage);
  return Number(line?.quantity ?? 0) + step * delta;
}

export function canAdjustCartLineQuantity({
  line,
  product,
  retailPackage = null,
  delta,
  cartLines,
  sellFromShop,
  posSalesConfig,
  allowNegativeStock,
  productByCode = {},
}) {
  const nextBaseQty = cartLineNextBaseQty(line, product, retailPackage, delta);
  if (nextBaseQty <= 0) {
    return { ok: true, willRemove: true };
  }
  if (delta < 0) {
    return { ok: true, willRemove: false };
  }
  if (allowNegativeStock) {
    return { ok: true, willRemove: false };
  }

  const stockAsRetail = cartLineStockAsRetail(line, product);
  const stockCheck = posStockAvailability({
    product,
    baseQty: nextBaseQty,
    cartLines,
    sellFromShop,
    posSalesConfig,
    allowNegativeStock,
    stockAsRetail,
    productByCode,
    excludeLineId: line?.id ?? line?.update_code,
  });

  return {
    ok: stockCheck.ok,
    willRemove: false,
    stockCheck,
  };
}

/** Entry qty string for repricing after a base-qty cart adjustment. */
export function cartLineEntryQtyForBaseQty(line, product, retailPackage, baseQty) {
  const isRetailLine = cartLineRetailStockFlag(line);
  return posEntryQtyFromBaseQty(baseQty, product, retailPackage, isRetailLine);
}

/**
 * Which stock location a sale line deducts from, given org stock-source settings.
 * @param {boolean} stockAsRetail — when per-line routing is on, true → shop, false → store
 */
export function posLineStockLocation(sellFromShop, posSalesConfig, stockAsRetail) {
  if (posSalesConfig.perLineStockRouting) {
    return stockAsRetail ? "shop" : "store";
  }
  if (posSalesConfig.allowShop && !posSalesConfig.allowStore) {
    return "shop";
  }
  if (!posSalesConfig.allowShop && posSalesConfig.allowStore) {
    return "store";
  }
  return sellFromShop ? "shop" : "store";
}

export function posStockLocationLabel(location, posSalesConfig) {
  if (posSalesConfig.perLineStockRouting) {
    return location === "store" ? "store (wholesale)" : "shop (retail)";
  }
  return location === "store" ? "store" : "shop";
}

export function productStockAtLocation(product, location) {
  const availableKey = location === "store" ? "stock_available_store" : "stock_available_shop";
  const onHandKey = location === "store" ? "stock_in_store" : "stock_in_shop";
  if (product?.[availableKey] != null) {
    return Number(product[availableKey]);
  }
  return Number(product?.[onHandKey] ?? 0);
}

/** Physical on-hand qty (ignores cart reservations). Use for POS cart validation. */
export function productPhysicalStockAtLocation(product, location) {
  const onHandKey = location === "store" ? "stock_in_store" : "stock_in_shop";
  return Number(product?.[onHandKey] ?? 0);
}

export function cartLineStockLocation(line, product, sellFromShop, posSalesConfig) {
  return posLineStockLocation(
    sellFromShop,
    posSalesConfig,
    cartLineStockAsRetail(line, product),
  );
}

export function cartQtyAtLocation(
  cartLines,
  productCode,
  location,
  sellFromShop,
  posSalesConfig,
  productByCode,
  excludeLineId = null,
) {
  if (!cartLines?.length) return 0;
  let total = 0;
  for (const line of cartLines) {
    if (line.product_code !== productCode) continue;
    if (lineMatchesRef(line, excludeLineId)) continue;
    const product = productByCode?.[line.product_code] ?? productByCode;
    const lineLoc = cartLineStockLocation(line, product, sellFromShop, posSalesConfig);
    if (lineLoc === location) {
      total += Number(line.quantity ?? 0);
    }
  }
  return total;
}

export function posStockAvailability({
  product,
  baseQty,
  cartLines,
  sellFromShop,
  posSalesConfig,
  allowNegativeStock,
  stockAsRetail,
  lineRetailStockFlag,
  productByCode = {},
  excludeLineId = null,
}) {
  if (allowNegativeStock || !product || baseQty <= 0) {
    return { ok: true, location: null, available: null, requested: baseQty, shortfall: 0 };
  }

  const resolvedStockAsRetail =
    stockAsRetail != null ? Boolean(stockAsRetail) : Boolean(lineRetailStockFlag);
  const location = posLineStockLocation(sellFromShop, posSalesConfig, resolvedStockAsRetail);
  const physical = productPhysicalStockAtLocation(product, location);
  const netAvailable = productStockAtLocation(product, location);
  const inCart = cartQtyAtLocation(
    cartLines,
    product.product_code,
    location,
    sellFromShop,
    posSalesConfig,
    { [product.product_code]: product, ...productByCode },
    excludeLineId,
  );
  const reservedForExcludedLine = reservedQtyForExcludedLine(cartLines, excludeLineId);
  const fromPhysical = Math.max(0, physical - inCart);
  const fromNet = Math.max(0, netAvailable + reservedForExcludedLine);
  const available = Math.min(fromPhysical, fromNet);
  const ok = baseQty <= available + 0.0001;

  return {
    ok,
    location,
    available,
    requested: baseQty,
    shortfall: ok ? 0 : baseQty - available,
    onHand: physical,
    inCart,
    netAvailable,
  };
}

/** Match the quantity field unit (bag, kg, …) for stock messages. */
export function posStockEntryDisplayMeta(product, sellWholesale, retailPackage = null) {
  const uom = product?.uom ?? null;
  const factor = uomConversionFactor(uom);
  const retailPricing = usesPosRetailPricing(sellWholesale, product, retailPackage);

  if (!retailPricing) {
    const unit = factor > 1 ? fullPackageLabel(uom) : smallPackagingLabel(uom);
    return {
      unitLabel: unit,
      wholesaleFullPack: factor > 1,
      toEntryQty(baseQty, { forAvailable = false } = {}) {
        const display =
          factor > 1 ? baseToDisplayQty(baseQty, factor) : Number(baseQty ?? 0);
        if (factor > 1 && forAvailable) {
          return Math.floor(display + 0.0001);
        }
        return display;
      },
    };
  }

  const small = smallPackagingLabel(uom);
  return {
    unitLabel: small,
    wholesaleFullPack: false,
    toEntryQty(baseQty) {
      return Number(baseQty ?? 0);
    },
  };
}

function formatEntryStockQty(baseQty, meta, { forAvailable = false } = {}) {
  const entryQty = meta.toEntryQty(baseQty, { forAvailable });
  return `${formatDisplayQty(entryQty)} ${meta.unitLabel}`;
}

export function posStockInsufficientMessage(
  check,
  { product, sellWholesale, retailPackage = null, posSalesConfig } = {},
) {
  if (!check || check.ok || !check.location) return null;
  const loc = posSalesConfig
    ? posStockLocationLabel(check.location, posSalesConfig)
    : check.location === "store"
      ? "store"
      : "shop";

  if (!product) {
    return `Insufficient ${loc} stock — available ${check.available}, requested ${check.requested}.`;
  }

  const meta = posStockEntryDisplayMeta(product, sellWholesale, retailPackage);
  const available = formatEntryStockQty(check.available, meta, { forAvailable: true });
  const requested = formatEntryStockQty(check.requested, meta);
  return `Insufficient ${loc} stock — available ${available}, requested ${requested}.`;
}

export function posCartHasInsufficientStock(
  cartLines,
  productByCode,
  sellFromShop,
  posSalesConfig,
  allowNegativeStock,
) {
  if (allowNegativeStock || !cartLines?.length) return false;

  for (const line of cartLines) {
    const product = productByCode[line.product_code];
    if (!product) continue;
    const check = posStockAvailability({
      product,
      baseQty: Number(line.quantity ?? 0),
      cartLines,
      sellFromShop,
      posSalesConfig,
      allowNegativeStock,
      stockAsRetail: cartLineStockAsRetail(line, product),
      productByCode,
      excludeLineId: cartLineRef(line),
    });
    if (!check.ok) return true;
  }

  return false;
}

function cartLineRef(line) {
  return line?.update_code ?? line?.id ?? null;
}

/** Which stock columns to show in POS product search for current settings. */
export function posStockDisplayMode(posSalesConfig, sellWholesale) {
  if (posSalesConfig.retailShopWholesaleStoreStock) {
    return "both";
  }
  if (posSalesConfig.perLineStockRouting) {
    return sellWholesale === false ? "shop" : "store";
  }
  if (posSalesConfig.allowShop && !posSalesConfig.allowStore) return "shop";
  if (!posSalesConfig.allowShop && posSalesConfig.allowStore) return "store";
  return "both";
}

export function productCartStockDisplayMode(product, posSalesConfig, sellWholesale = true) {
  if (!product || !posSalesConfig) return "store";

  if (posSalesConfig.allowShop && !posSalesConfig.allowStore) return "shop";
  if (!posSalesConfig.allowShop && posSalesConfig.allowStore) return "store";

  if (posSalesConfig.retailShopWholesaleStoreStock) {
    return productSellsRetail(product) ? "both" : "store";
  }

  return posStockDisplayMode(posSalesConfig, sellWholesale);
}

/** Stock summary on add-to-cart — respects org stock source settings. */
export function productCartStockLabel(product, posSalesConfig, { sellWholesale = true } = {}) {
  if (!product) return "";

  const mode = productCartStockDisplayMode(product, posSalesConfig, sellWholesale);
  const uom = product.uom ?? null;
  const shopText = formatMixedStockDisplay(productStockAtLocation(product, "shop"), uom).text;
  const storeText = formatMixedStockDisplay(productStockAtLocation(product, "store"), uom).text;

  if (mode === "both") {
    if (posSalesConfig?.retailShopWholesaleStoreStock || posSalesConfig?.perLineStockRouting) {
      return `Shop (retail): ${shopText} · Store (wholesale): ${storeText}`;
    }
    return `Shop: ${shopText} · Store: ${storeText}`;
  }

  if (mode === "store") return `Store: ${storeText}`;
  return `Shop: ${shopText}`;
}
