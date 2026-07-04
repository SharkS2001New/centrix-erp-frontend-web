import { formatDisplayQty, formatMixedStockDisplay } from "@/lib/stock-uom";

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
    map.set(code, resolveUom(uomById, product.unit_id));
  }
  return map;
}

export function uomForFulfillmentLine(line, uomByProductCode) {
  if (line?.uom && typeof line.uom === "object") return line.uom;
  const code = line?.product_code;
  if (!code || !uomByProductCode) return null;
  return uomByProductCode.get(code) ?? null;
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
