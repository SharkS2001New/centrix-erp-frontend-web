"use client";

import { smallPackagingLabel } from "@/lib/uom-packaging";
import { saleLineQtyLabel } from "@/lib/sale-line-items";

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

/** Display qty with packaging labels — same units as the original sale line. */
export function customerReturnLineQtyLabel(line, uomById, qtyField = "return_qty") {
  const qty = line?.[qtyField] ?? 0;
  return saleLineQtyLabel({ ...line, quantity: qty }, uomById);
}

/** Short unit label for qty inputs (e.g. pcs, kg, carton). */
export function customerReturnLineUnitLabel(line, uomById) {
  const uom = resolveCustomerReturnLineUom(line, uomById);
  if (uom) return smallPackagingLabel(uom);
  if (line?.uom) return line.uom;
  return "units";
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
    product: item.product ?? null,
    quantity_sold: qty,
    already_returned: alreadyReturned,
    max_return_qty: maxReturnQty,
    return_qty: 0,
    unit_price: unitPrice,
    amount: 0,
    line_no: item.line_no ?? null,
  };
}

export function recalcReturnLine(line) {
  const returnQty = Math.max(0, Number(line.return_qty) || 0);
  const unitPrice = Number(line.unit_price) || 0;
  const maxQty =
    line.max_return_qty != null
      ? Number(line.max_return_qty)
      : Number(line.quantity_sold) || 0;
  const clampedQty = maxQty > 0 ? Math.min(returnQty, maxQty) : returnQty;

  return {
    ...line,
    return_qty: clampedQty,
    amount: Math.round(clampedQty * unitPrice * 100) / 100,
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
