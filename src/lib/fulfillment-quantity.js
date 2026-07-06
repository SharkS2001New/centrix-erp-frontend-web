import { fullPackageLabel, smallPackagingLabel } from "@/lib/uom-packaging";
import {
  baseToDisplayQty,
  displayToBaseQty,
  formatDisplayQty,
  formatMixedStockDisplay,
} from "@/lib/stock-uom";

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

/** Total base units with small-unit label (e.g. "300 pcs") for loading list "Total items". */
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

/** Primary package label for picked-qty input (e.g. "Carton", "jerican"). */
export function fulfillmentPickedInputUnit(line, uomByProductCode) {
  const uom = uomForFulfillmentLine(line, uomByProductCode);
  if (!uom) return "units";
  const factor = Number(uom.conversion_factor ?? 1);
  if (factor > 1) return fullPackageLabel(uom);
  return smallPackagingLabel(uom);
}

/** Convert stored base qty to the package count shown in the picked input. */
export function fulfillmentPickedDisplayQty(baseQty, line, uomByProductCode) {
  const uom = uomForFulfillmentLine(line, uomByProductCode);
  const base = Number(baseQty ?? 0);
  if (!uom) return base;
  return baseToDisplayQty(base, uom);
}

/** Convert picked input (package units) back to stored base qty. */
export function fulfillmentPickedBaseQty(displayQty, line, uomByProductCode) {
  const uom = uomForFulfillmentLine(line, uomByProductCode);
  const display = Number(displayQty ?? 0);
  if (!uom) return display;
  return displayToBaseQty(display, uom);
}

/** Load UOM records for specific product codes (trip pick/load lines). */
export async function fetchCatalogForProductCodes(apiRequest, productCodes) {
  const codes = [...new Set((productCodes ?? []).map((code) => String(code).trim()).filter(Boolean))];
  const uomRes = await apiRequest("/uoms", { searchParams: { per_page: 500 } });
  const uoms = uomRes.data ?? [];
  if (!codes.length) return { products: [], uoms };

  const products = (
    await Promise.all(
      codes.map((code) => apiRequest(`/products/${encodeURIComponent(code)}`).catch(() => null)),
    )
  ).filter(Boolean);

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
