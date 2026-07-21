import { fullPackageLabel, smallPackagingLabel } from "@/lib/uom-packaging";
import {
  baseToDisplayQty,
  baseToHierarchyCounts,
  displayToBaseQty,
  formatDisplayQty,
  formatMixedStockDisplay,
  uomConversionFactor,
} from "@/lib/stock-uom";
import { fetchProductsByCodesCached } from "@/lib/catalog-cache";
import { fetchUomsCached } from "@/lib/reference-data-cache";

/** Map UOM id → record (string-normalized keys). */
export function buildUomById(uoms = []) {
  const map = new Map();
  for (const uom of uoms) {
    if (uom?.id == null) continue;
    map.set(String(uom.id), uom);
  }
  return map;
}

export function resolveUom(uomById, unitId) {
  if (!uomById || unitId == null || unitId === "") return null;
  return uomById.get(String(unitId)) ?? null;
}

/** product_code → UOM for fulfillment / distribution lines. */
export function buildUomByProductCode(products = [], uoms = []) {
  const uomById = buildUomById(uoms);
  const map = new Map();
  for (const product of products) {
    const code = product?.product_code;
    if (!code) continue;
    map.set(String(code), resolveUom(uomById, product.unit_id));
  }
  return map;
}

export function uomForFulfillmentLine(line, uomByProductCode) {
  if (line?.uom && typeof line.uom === "object") return line.uom;
  const code = line?.product_code;
  if (!code || !uomByProductCode) return null;
  return uomByProductCode.get(String(code)) ?? null;
}

/** Total base units with small-unit label (e.g. "300 pcs") — secondary breakdown on loading lists. */
export function fulfillmentBaseItemCount(baseQty, line, uomByProductCode) {
  const uom = uomForFulfillmentLine(line, uomByProductCode);
  const base = Number(baseQty ?? 0);
  if (!uom) {
    const fallback = line?.quantity_label;
    if (fallback != null && String(fallback).trim() !== "") return String(fallback).trim();
    return formatDisplayQty(base);
  }
  return `${formatDisplayQty(base)} ${smallPackagingLabel(uom)}`;
}

/**
 * Whether picked-qty input should use small/base units (pieces) instead of full packages.
 * Matches the Requested column: loose pieces or mixed packaging use base units so the
 * picker enters the same numbers they see (e.g. 5 piece, not 0.416 carton).
 */
export function fulfillmentPickedUsesSmallUnit(line, uomByProductCode) {
  const uom = uomForFulfillmentLine(line, uomByProductCode);
  const base = Number(line?.required_qty ?? 0);
  if (!uom) return true;

  const factor = uomConversionFactor(uom);
  if (factor <= 1) return true;

  const counts = baseToHierarchyCounts(base, uom);
  const hasFull = Number(counts.full ?? 0) > 0.0001;
  const hasSmall = Number(counts.small ?? 0) > 0.0001;

  if (hasSmall) return true;
  return !hasFull;
}

/** Primary package label for picked-qty input (e.g. "Carton", "piece"). */
export function fulfillmentPickedInputUnit(line, uomByProductCode) {
  const uom = uomForFulfillmentLine(line, uomByProductCode);
  if (!uom) return "units";
  if (fulfillmentPickedUsesSmallUnit(line, uomByProductCode)) {
    return smallPackagingLabel(uom);
  }
  return fullPackageLabel(uom);
}

/** Convert stored base qty to the unit count shown in the picked input. */
export function fulfillmentPickedDisplayQty(baseQty, line, uomByProductCode) {
  const uom = uomForFulfillmentLine(line, uomByProductCode);
  const base = Number(baseQty ?? 0);
  if (!uom) return base;
  if (fulfillmentPickedUsesSmallUnit(line, uomByProductCode)) {
    return base;
  }
  return baseToDisplayQty(base, uom);
}

/** Convert picked input back to stored base qty. */
export function fulfillmentPickedBaseQty(displayQty, line, uomByProductCode) {
  const uom = uomForFulfillmentLine(line, uomByProductCode);
  const display = Number(displayQty ?? 0);
  if (!uom) return display;
  if (fulfillmentPickedUsesSmallUnit(line, uomByProductCode)) {
    return display;
  }
  return displayToBaseQty(display, uom);
}

/** Collect product codes from loading/picking list payloads (flat or order-nested). */
export function collectFulfillmentProductCodes(...lists) {
  const codes = [];
  for (const list of lists) {
    if (!list) continue;
    for (const line of list.lines ?? []) {
      if (line?.product_code) codes.push(line.product_code);
    }
    for (const order of list.orders ?? []) {
      for (const line of order.lines ?? []) {
        if (line?.product_code) codes.push(line.product_code);
      }
    }
  }
  return codes;
}

/**
 * Load products for specific codes (batched) + cached UOMs.
 * `apiRequest` kept for call-site compatibility; unused.
 */
export async function fetchCatalogForProductCodes(_apiRequest, productCodes, organizationId = null) {
  const codes = [...new Set((productCodes ?? []).map((code) => String(code).trim()).filter(Boolean))];
  const [products, uoms] = await Promise.all([
    codes.length ? fetchProductsByCodesCached(organizationId, codes, { status: "all" }) : Promise.resolve([]),
    fetchUomsCached(organizationId),
  ]);
  return { products, uoms };
}

/** Format a base-quantity line like the products catalogue (e.g. "2 Bag, 40 kg"). */
export function formatFulfillmentQty(baseQty, line, uomByProductCode) {
  const uom = uomForFulfillmentLine(line, uomByProductCode);
  if (uom) {
    return formatMixedStockDisplay(baseQty, uom).text;
  }
  const fallback = line?.quantity_label ?? line?.pack_breakdown;
  if (fallback != null && String(fallback).trim() !== "") {
    return String(fallback).trim();
  }
  return formatDisplayQty(baseQty);
}

/** Loading list row labels: primary packaging qty + optional base-unit breakdown. */
export function fulfillmentLoadingListLabels(baseQty, line, uomByProductCode) {
  const packaging = formatFulfillmentQty(baseQty, line, uomByProductCode);
  const baseCount = fulfillmentBaseItemCount(baseQty, line, uomByProductCode);

  return {
    quantityLabel: packaging,
    packBreakdown: packaging !== baseCount ? baseCount : "",
  };
}

/** Unit price per packaging level shown on loading lists (e.g. per carton, not per piece). */
export function fulfillmentPackageUnitPrice(line, uomByProductCode) {
  const baseQty = Number(line?.quantity ?? 0);
  const displayQty = fulfillmentPickedDisplayQty(baseQty, line, uomByProductCode);
  const lineTotal = Number(line?.line_total ?? 0);
  if (displayQty > 0 && lineTotal > 0) {
    return Math.round((lineTotal / displayQty) * 100) / 100;
  }

  const basePrice = Number(line?.unit_price ?? 0);
  const uom = uomForFulfillmentLine(line, uomByProductCode);
  const factor = uomConversionFactor(uom);
  return factor > 1 ? Math.round(basePrice * factor * 100) / 100 : basePrice;
}
