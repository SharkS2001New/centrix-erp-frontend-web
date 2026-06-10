/** Whether a POS line counts as retail for shop/store stock routing. */
import {
  baseToDisplayQty,
  formatDisplayQty,
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

/**
 * Retail-side flag for stock routing (shop vs store).
 * Per-line routing: retail pricing session → shop; wholesale session → store.
 */
export function posLineRetailStockFlag(posSalesConfig, sellWholesale, computedIsRetail) {
  if (posSalesConfig.perLineStockRouting) {
    return sellWholesale === false;
  }
  return Boolean(computedIsRetail);
}

export function cartLineRetailStockFlag(line) {
  return Number(line?.on_wholesale_retail) === 1;
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

  const lineRetailStockFlag = cartLineRetailStockFlag(line);
  const stockCheck = posStockAvailability({
    product,
    baseQty: nextBaseQty,
    cartLines,
    sellFromShop,
    posSalesConfig,
    allowNegativeStock,
    lineRetailStockFlag,
    productByCode,
    excludeLineId: line?.id,
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
 */
export function posLineStockLocation(sellFromShop, posSalesConfig, lineRetailStockFlag) {
  if (posSalesConfig.perLineStockRouting) {
    return lineRetailStockFlag ? "shop" : "store";
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
  return Number(
    location === "store" ? product?.stock_in_store : product?.stock_in_shop ?? 0,
  );
}

export function cartLineStockLocation(line, product, sellFromShop, posSalesConfig) {
  const lineRetail = cartLineRetailStockFlag(line);
  return posLineStockLocation(sellFromShop, posSalesConfig, lineRetail);
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
  const excludedId = excludeLineId != null ? String(excludeLineId) : null;
  let total = 0;
  for (const line of cartLines) {
    if (line.product_code !== productCode) continue;
    if (excludedId != null && String(line.id) === excludedId) continue;
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
  lineRetailStockFlag,
  productByCode = {},
  excludeLineId = null,
}) {
  if (allowNegativeStock || !product || baseQty <= 0) {
    return { ok: true, location: null, available: null, requested: baseQty, shortfall: 0 };
  }

  const location = posLineStockLocation(sellFromShop, posSalesConfig, lineRetailStockFlag);
  const onHand = productStockAtLocation(product, location);
  const inCart = cartQtyAtLocation(
    cartLines,
    product.product_code,
    location,
    sellFromShop,
    posSalesConfig,
    { [product.product_code]: product, ...productByCode },
    excludeLineId,
  );
  const available = Math.max(0, onHand - inCart);
  const ok = baseQty <= available + 0.0001;

  return {
    ok,
    location,
    available,
    requested: baseQty,
    shortfall: ok ? 0 : baseQty - available,
    onHand,
    inCart,
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

  const demand = new Map();
  for (const line of cartLines) {
    const product = productByCode[line.product_code];
    if (!product) continue;
    const location = cartLineStockLocation(line, product, sellFromShop, posSalesConfig);
    const key = `${line.product_code}:${location}`;
    demand.set(key, (demand.get(key) ?? 0) + Number(line.quantity ?? 0));
  }

  for (const [key, qty] of demand) {
    const [code, location] = key.split(":");
    const product = productByCode[code];
    if (!product) continue;
    const onHand = productStockAtLocation(product, location);
    if (qty > onHand + 0.0001) return true;
  }

  return false;
}

/** Which stock columns to show in POS product search for current settings. */
export function posStockDisplayMode(posSalesConfig, sellWholesale) {
  if (posSalesConfig.perLineStockRouting) {
    return sellWholesale === false ? "shop" : "store";
  }
  if (posSalesConfig.allowShop && !posSalesConfig.allowStore) return "shop";
  if (!posSalesConfig.allowShop && posSalesConfig.allowStore) return "store";
  return "both";
}
