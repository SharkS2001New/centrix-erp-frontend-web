import { smallPackagingLabel, uomConversionSummary } from "@/lib/uom-packaging";
import {
  baseToHierarchyCounts,
  displayToBaseQty,
  formatMixedStockDisplay,
  stockTakeCountsToBase,
  uomConversionFactor,
} from "@/lib/stock-uom";
import { uomStockTakeLevels } from "@/lib/uom-packaging";

/** Human-readable UOM chain, e.g. "1 Bag = 50 kg · 1 outer = 20 kg". */
export function formatLpoPackagingLabel(uom) {
  if (!uom) return "—";
  const summary = uomConversionSummary(uom);
  if (summary) return summary;
  const small = smallPackagingLabel(uom);
  return `Count in ${small}`;
}

/** @deprecated Prefer formatLpoPackagingLabel for LPO packaging column. */
export function formatPackagingLabel(uom) {
  if (!uom) return "—";
  const packageName = packageNameFromUom(uom);
  return `${packageName} (${formatFactor(uom.conversion_factor ?? 1)})`;
}

export function packageNameFromUom(uom) {
  if (!uom) return "package";
  return (uom.full_name || uom.uom_type || "package").trim();
}

export function measureUnitFromUom(uom) {
  if (!uom) return "units";
  const t = String(uom.uom_type || "units").trim();
  const labels = {
    piece: "pieces",
    pcs: "pieces",
    kg: "kg",
    g: "g",
    l: "litres",
    ml: "ml",
    m: "m",
    cm: "cm",
    carton: "cartons",
    bag: "bags",
  };
  return labels[t.toLowerCase()] ?? t;
}

export function formatPackQtyString(packQty) {
  const n = Number(packQty);
  if (!Number.isFinite(n) || n <= 0) return "";
  return String(Math.round(n * 1000) / 1000);
}

/** Split stored pack qty into per-level count strings for order inputs. */
export function orderCountsObjectFromPackQty(packQty, uom) {
  const factor = uomConversionFactor(uom);
  const base = factor > 1 ? displayToBaseQty(packQty, factor) : Number(packQty) || 0;
  const { full, middle, small } = baseToHierarchyCounts(base, uom);
  const levels = uomStockTakeLevels(uom);
  const counts = {};
  for (const level of levels) {
    const v = level.key === "full" ? full : level.key === "middle" ? middle : small;
    counts[level.key] = String(v);
  }
  return counts;
}

/** Hierarchy count inputs → decimal full-pack qty for API / cost totals. */
export function orderCountsToPackQty(orderCounts, uom) {
  if (!orderCounts) return 0;
  const levels = uomStockTakeLevels(uom);
  const byKey = {};
  for (const level of levels) {
    const raw = orderCounts[level.key];
    byKey[level.key] = raw === "" || raw == null ? 0 : Number(raw);
  }
  const base = stockTakeCountsToBase(byKey, uom);
  const factor = uomConversionFactor(uom);
  if (factor <= 1) return base;
  return Math.round((base / factor) * 1000) / 1000;
}

/** Pack qty (stored on LPO lines) → mixed UOM text, e.g. "2 Bag, 40 kg". */
export function formatLpoPackQtyDisplay(packQty, uom) {
  const qty = Number(packQty);
  if (!Number.isFinite(qty)) return "—";
  if (!uom) return String(packQty);
  const factor = uomConversionFactor(uom);
  const base = factor > 1 ? displayToBaseQty(qty, factor) : qty;
  return formatMixedStockDisplay(base, uom).text;
}

/** Split packaging summary into display lines. */
export function lpoPackagingParts(label) {
  const text = String(label ?? "").trim();
  if (!text || text === "—") return ["—"];
  return text.split(" · ").map((part) => part.trim()).filter(Boolean);
}

export function formatFactor(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "1";
  return Number.isInteger(n)
    ? String(n)
    : n.toLocaleString("en-KE", { maximumFractionDigits: 3 });
}

/** @param {object} product @param {Map<number, object>} uomById @param {Map<number, object>} vatById */
export function enrichProductForLpo(product, uomById, vatById) {
  const unitId = product.unit_id;
  const uom =
    uomById.get(unitId) ??
    uomById.get(String(unitId ?? "")) ??
    product.uom ??
    null;
  const vatId = product.vat_id;
  const vat =
    vatById.get(vatId) ??
    vatById.get(String(vatId ?? "")) ??
    product.vat ??
    null;
  const packaging = formatLpoPackagingLabel(uom);
  const packName = packageNameFromUom(uom);

  return {
    ...product,
    uom,
    packaging_label: packaging,
    conversion_factor: Number(uom?.conversion_factor ?? 1),
    package_name: packName,
    measure_unit: measureUnitFromUom(uom),
    uom_label: packName,
    vat_rate: vat?.vat_percentage != null ? Number(vat.vat_percentage) : 0,
    unit_price_display: Number(product.unit_price ?? 0),
    stock_in_shop: Number(
      product.stock_on_hand_shop ?? product.stock_in_shop ?? 0,
    ),
    stock_in_store: Number(
      product.stock_on_hand_store ?? product.stock_in_store ?? 0,
    ),
    stock_available_shop: Number(
      product.stock_available_shop ??
        product.branch_stock?.shop_available ??
        product.stock_in_shop ??
        0,
    ),
    stock_available_store: Number(
      product.stock_available_store ??
        product.branch_stock?.store_available ??
        product.stock_in_store ??
        0,
    ),
  };
}

export function lineFromEnrichedProduct(product) {
  const cost =
    product.last_cost_price != null && product.last_cost_price !== ""
      ? Number(product.last_cost_price)
      : 0;
  const uom = product.uom;
  const packName = product.package_name ?? packageNameFromUom(uom);
  const order_counts = orderCountsObjectFromPackQty(1, uom);

  return {
    product_code: product.product_code,
    product_name: product.product_name ?? product.product_code,
    packaging_label: product.packaging_label ?? formatLpoPackagingLabel(uom),
    conversion_factor: Number(product.conversion_factor ?? uom?.conversion_factor ?? 1),
    package_name: packName,
    measure_unit: product.measure_unit ?? measureUnitFromUom(uom),
    // Keep the real UOM object for measure conversion (damages / transfers / adjustments).
    // Package label for display lives on package_name / packaging_label.
    uom: uom && typeof uom === "object" ? uom : null,
    unit_id: product.unit_id,
    vat_rate: product.vat_rate ?? 0,
    order_counts,
    ordered_qty: formatPackQtyString(orderCountsToPackQty(order_counts, uom)),
    cost_price: cost > 0 ? String(Math.trunc(cost)) : "",
  };
}

/** Resolve UOM for inventory lines (never treat package name strings as UOM rows). */
export function resolveInventoryLineUom(line, uomById) {
  if (line?.uom && typeof line.uom === "object") return line.uom;
  if (line?.unit_id != null && uomById?.get) return uomById.get(line.unit_id) ?? null;
  return null;
}
