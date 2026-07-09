import { formatDisplayQty, formatMixedStockDisplay, uomLabelFrom } from "@/lib/stock-uom";

const EXCLUDED_INVENTORY_QTY_KEYS = new Set([
  "conversion_factor",
  "unit_cost",
  "unit_price",
  "unit_id",
  "cost_price",
  "effective_unit_cost",
  "last_cost_price",
  "wholesale_price",
  "middle_factor",
  "incident_count",
  "transfer_count",
  "reservation_count",
]);

const INVENTORY_QTY_KEY_PATTERN =
  /qty|quantity|units_received|units_moved|quantity_change|quantity_before|quantity_after|quantity_moved|total_moved|reserved_qty|reorder_point|on_hand|current_shop|current_store|shop_quantity|store_quantity|total_base|total_qty|in_qty|out_qty/i;

/** True when a report/list column key holds a base-unit inventory quantity. */
export function isInventoryQtyField(key) {
  if (!key || EXCLUDED_INVENTORY_QTY_KEYS.has(key)) return false;
  return INVENTORY_QTY_KEY_PATTERN.test(key);
}

/** Build a minimal UOM object from common API row shapes. */
export function resolveUomFromInventoryRow(row) {
  if (!row || typeof row !== "object") return null;

  const embedded = row.uom ?? row.product?.uom ?? row.product?.unit;
  if (embedded && typeof embedded === "object") {
    return embedded;
  }

  const uomName =
    row.uom_name ??
    row.product?.uom_name ??
    row.product?.unit?.full_name ??
    row.package_name ??
    row.product?.package_name;

  const factor =
    row.conversion_factor ??
    row.product?.conversion_factor ??
    row.product?.unit?.conversion_factor ??
    row.uom_factor ??
    row.factor;

  if (!uomName && factor == null && !row.small_packaging_label) {
    return null;
  }

  return {
    full_name: uomName,
    conversion_factor: factor ?? 1,
    small_packaging_label: row.small_packaging_label ?? row.product?.small_packaging_label,
    middle_packaging_label: row.middle_packaging_label ?? row.product?.middle_packaging_label,
    middle_factor: row.middle_factor ?? row.product?.middle_factor,
    uom_type: row.uom_type ?? row.product?.uom_type,
  };
}

/** Format a base-unit quantity as e.g. "10 Bag" or "2 Bag, 40 kg". */
export function formatInventoryQtyWithUom(baseQty, row) {
  if (baseQty == null || baseQty === "") return "—";
  const n = Number(baseQty);
  if (!Number.isFinite(n)) return String(baseQty);

  const uom = resolveUomFromInventoryRow(row);
  if (!uom) {
    return formatDisplayQty(n);
  }

  const label = uom.full_name ?? uomLabelFrom(uom);
  return formatMixedStockDisplay(n, uom, label).text;
}
