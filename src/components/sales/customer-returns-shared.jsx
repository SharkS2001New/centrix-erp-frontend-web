"use client";

import { smallPackagingLabel, uomStockTakeLevels } from "@/lib/uom-packaging";
import { saleLineQtyLabel } from "@/lib/sale-line-items";
import { formatDisplayQty, stockTakeCountsToBase } from "@/lib/stock-uom";
import {
  countKey,
  initStockTakeCounts,
  readStockTakeCounts,
} from "@/components/inventory/stock-take-count-inputs";

export const RETURN_REASONS = [
  "Damaged Product",
  "Wrong Item",
  "Customer Changed Mind",
  "Expired Product",
  "Defective",
  "Other",
];

export const REFUND_METHODS = [
  { value: "CASH", label: "Cash" },
  { value: "MPESA", label: "M-Pesa" },
  { value: "CARD", label: "Card" },
  { value: "CREDIT", label: "Store credit" },
  { value: "ORIGINAL", label: "Original payment method" },
];

export const RETURN_STATUS_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const STATUS_TONES = {
  pending: "bg-amber-50 text-amber-800 ring-amber-600/20",
  approved: "bg-emerald-50 text-emerald-800 ring-emerald-600/20",
  rejected: "bg-red-50 text-red-700 ring-red-600/20",
};

export function normalizeReturnStatus(status) {
  return String(status ?? "pending").trim().toLowerCase();
}

export function isReturnPending(status) {
  return normalizeReturnStatus(status) === "pending";
}

export function ReturnStatusBadge({ status }) {
  const key = normalizeReturnStatus(status);
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${STATUS_TONES[key] ?? STATUS_TONES.pending}`}
    >
      {RETURN_STATUS_LABELS[key] ?? status ?? "—"}
    </span>
  );
}

export function refundMethodLabel(code) {
  return REFUND_METHODS.find((m) => m.value === code)?.label ?? code ?? "—";
}

export function stockLocationLabel(code) {
  if (code === "store") return "Store / warehouse";
  if (code === "shop") return "Shop floor";
  return code ?? "—";
}

/** Resolve UOM object for a customer return line (matches sale line behaviour). */
export function resolveCustomerReturnLineUom(line, uomById) {
  if (line?.product?.unit_id != null && uomById?.get) {
    return uomById.get(line.product.unit_id) ?? line.product?.unit ?? null;
  }
  return line?.product?.unit ?? line?.product?.uom ?? null;
}

/** Legacy sale lines keep the original LightStores qty + unit — not Centrix UOM conversion. */
export function legacyReturnLineQtyLabel(line, qtyField = "return_qty") {
  const qty = line?.[qtyField] ?? 0;
  const unit = line?.sold_uom?.trim() || line?.uom?.trim() || "units";
  return `${formatDisplayQty(qty)} ${unit}`;
}

/** Display qty with packaging labels — Centrix sales use product UOM; legacy uses sold_uom. */
export function customerReturnLineQtyLabel(line, uomById, qtyField = "return_qty", options = {}) {
  const legacy =
    line?.display_uom_mode === "legacy" ||
    options.returnKind === "legacy" ||
    options.legacy === true;
  if (legacy) {
    return legacyReturnLineQtyLabel(line, qtyField);
  }
  const qty = line?.[qtyField] ?? 0;
  return saleLineQtyLabel(
    { ...line, quantity: qty, on_wholesale_retail: line?.on_wholesale_retail },
    uomById,
  );
}

/** Short unit label for qty inputs (e.g. pcs, kg, carton). */
export function customerReturnLineUnitLabel(line, uomById, options = {}) {
  const legacy =
    line?.display_uom_mode === "legacy" ||
    options.returnKind === "legacy" ||
    options.legacy === true;
  if (legacy) {
    return line?.sold_uom?.trim() || line?.uom?.trim() || "units";
  }
  const uom = resolveCustomerReturnLineUom(line, uomById);
  if (uom) return smallPackagingLabel(uom);
  if (line?.uom) return line.uom;
  return "units";
}

export function returnLineCountId(line) {
  return String(line.sale_item_id ?? line.product_code ?? "line");
}

/** Packaging levels shown when entering a Centrix return qty. */
export function returnQtyInputLevels(line, uom) {
  const levels = uomStockTakeLevels(uom);
  if (Number(line?.on_wholesale_retail) === 1) {
    return levels.filter((level) => level.key === "small");
  }
  return levels;
}

/** Build empty hierarchy count fields for a return line. */
export function initReturnLineCounts(line, uom, baseQty = 0) {
  const levels = returnQtyInputLevels(line, uom);
  return initStockTakeCounts(returnLineCountId(line), baseQty, uom, levels);
}

/** Apply packaging-level counts to a Centrix return line (return_qty stored in base units). */
export function recalcReturnLineFromCounts(line, counts, uomById) {
  const uom = resolveCustomerReturnLineUom(line, uomById);
  const levels = returnQtyInputLevels(line, uom);
  const byKey = readStockTakeCounts(returnLineCountId(line), levels, counts);
  const baseQty = stockTakeCountsToBase(byKey, uom);
  return recalcReturnLine({ ...line, return_qty: baseQty });
}

export function emptyReturnLineFromSaleItem(item) {
  const qty = Number(item.quantity_sold ?? item.quantity ?? 0);
  const unitPrice = Number(item.unit_price ?? item.selling_price ?? 0);
  const alreadyReturned = Number(item.already_returned ?? 0);
  const maxReturnQty =
    item.max_return_qty != null
      ? Number(item.max_return_qty)
      : Math.max(0, qty - alreadyReturned);

  return {
    sale_item_id: item.sale_item_id ?? item.id ?? null,
    product_code: item.product_code,
    product_name: item.product_name ?? item.product_code,
    uom: item.uom ?? item.product?.unit?.uom_type ?? null,
    sold_uom: item.sold_uom ?? item.uom ?? null,
    product: item.product ?? null,
    quantity_sold: qty,
    already_returned: alreadyReturned,
    max_return_qty: maxReturnQty,
    return_qty: 0,
    unit_price: unitPrice,
    line_total: Number(item.line_total ?? item.amount ?? 0),
    amount: 0,
    line_no: item.line_no ?? null,
    on_wholesale_retail: Number(item.on_wholesale_retail ?? 0),
    display_uom_mode: item.display_uom_mode ?? "centrix",
    full_return: Boolean(item.full_return),
  };
}

export function recalcReturnLine(line) {
  const returnQty = Math.max(0, Number(line.return_qty) || 0);
  const maxQty =
    line.max_return_qty != null
      ? Number(line.max_return_qty)
      : Number(line.quantity_sold) || 0;
  const clampedQty = maxQty > 0 ? Math.min(returnQty, maxQty) : returnQty;
  const lineTotal = Number(line.line_total);
  const remainingQty = maxQty || Number(line.quantity_sold) || 0;

  let amount;
  if (Number.isFinite(lineTotal) && lineTotal > 0 && remainingQty > 0) {
    amount =
      clampedQty + 0.0001 >= remainingQty
        ? lineTotal
        : Math.round(lineTotal * (clampedQty / remainingQty) * 100) / 100;
  } else {
    const unitPrice = Number(line.unit_price) || 0;
    amount = Math.round(clampedQty * unitPrice * 100) / 100;
  }

  const unitPrice =
    clampedQty > 0 ? Math.round((amount / clampedQty) * 100) / 100 : Number(line.unit_price) || 0;

  return {
    ...line,
    return_qty: clampedQty,
    unit_price: unitPrice,
    amount,
  };
}

/** Legacy returns credit the original sale line total — not qty × recomputed unit price. */
export function recalcLegacyReturnLine(line) {
  const returnQty = Math.max(0, Number(line.return_qty) || 0);
  const maxQty =
    line.max_return_qty != null
      ? Number(line.max_return_qty)
      : Number(line.quantity_sold) || 0;
  const clampedQty = maxQty > 0 ? Math.min(returnQty, maxQty) : returnQty;
  const lineTotal = Number(line.line_total);
  const remainingQty = Number(line.max_return_qty ?? line.quantity_sold) || 0;

  let amount;
  if (Number.isFinite(lineTotal) && lineTotal > 0 && remainingQty > 0) {
    amount =
      clampedQty + 0.0001 >= remainingQty
        ? lineTotal
        : Math.round(lineTotal * (clampedQty / remainingQty) * 100) / 100;
  } else {
    const unitPrice = Number(line.unit_price) || 0;
    amount = Math.round(clampedQty * unitPrice * 100) / 100;
  }

  const unitPrice =
    clampedQty > 0 ? Math.round((amount / clampedQty) * 100) / 100 : Number(line.unit_price) || 0;

  return {
    ...line,
    return_qty: clampedQty,
    unit_price: unitPrice,
    amount,
  };
}

export function totalReturnAmount(lines) {
  return (lines ?? []).reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
}

/** Sum of original sale line totals still being returned (legacy full-order credit). */
export function totalLegacyReturnCredit(lines) {
  return (lines ?? []).reduce(
    (sum, line) => sum + (Number(line.line_total ?? line.amount) || 0),
    0,
  );
}

/** True when every returnable line is set to its max return qty. */
export function isFullOrderReturn(lines) {
  const returnable = (lines ?? []).filter((line) => Number(line.max_return_qty) > 0);
  if (!returnable.length) return false;
  return returnable.every(
    (line) => Number(line.return_qty) + 0.0001 >= Number(line.max_return_qty),
  );
}

/** Set one Centrix line to return everything still returnable. */
export function applyFullReturnToLine(line, uomById) {
  const maxQty = Number(line.max_return_qty) || 0;
  if (maxQty <= 0) {
    return recalcReturnLine({ ...line, return_qty: 0 });
  }
  return recalcReturnLine({ ...line, return_qty: maxQty });
}

/** Fill every returnable Centrix line to max qty with matching refund amounts. */
export function applyReturnAllLines(lines, uomById) {
  return (lines ?? []).map((line) => applyFullReturnToLine(line, uomById));
}

/** Build hierarchy count inputs for lines at their max return qty. */
export function buildReturnCountsForLines(lines, uomById) {
  const counts = {};
  for (const line of lines ?? []) {
    const maxQty = Number(line.max_return_qty) || 0;
    if (maxQty <= 0) continue;
    const uom = resolveCustomerReturnLineUom(line, uomById);
    Object.assign(counts, initReturnLineCounts(line, uom, maxQty));
  }
  return counts;
}

/** Clear return quantities on Centrix lines. */
export function clearReturnAllLines(lines) {
  return (lines ?? []).map((line) => recalcReturnLine({ ...line, return_qty: 0 }));
}

/** Prepare a legacy line for mandatory full return using original order amounts. */
export function legacyFullReturnLine(line) {
  const qtySold = Number(line.quantity_sold) || 0;
  const maxReturn = Number(line.max_return_qty ?? qtySold) || 0;
  const returnQty = maxReturn > 0 ? maxReturn : qtySold;
  const lineTotal = Number(line.line_total ?? line.amount ?? 0);

  return recalcLegacyReturnLine({
    ...line,
    display_uom_mode: "legacy",
    full_return: true,
    quantity_sold: qtySold,
    return_qty: returnQty,
    line_total: lineTotal,
    sold_uom: line.sold_uom ?? line.uom ?? null,
  });
}

/** Parse invoice / receipt reference from user input (S0001, INV-1005, or raw number). */
export function parseInvoiceNumber(query) {
  const q = String(query ?? "").trim();
  if (!q) return null;

  const invMatch = q.match(/^INV-?(\d+)$/i);
  if (invMatch) return Number(invMatch[1]);

  const sMatch = q.match(/^S0*(\d+)$/i);
  if (sMatch) return Number(sMatch[1]);

  if (/^\d+$/.test(q)) return Number(q);

  return null;
}
