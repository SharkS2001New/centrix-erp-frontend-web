import {
  formatLinePackQty,
  packQtyFromReceiveBase,
  receiveBaseForLine,
} from "@/components/inventory/lpo-receive-stock";
import { formatStockQty } from "@/components/inventory/inventory-shared";
import { lpoDisplayNumber } from "@/components/lpo/lpo-shared";
import { uomConversionFactor } from "@/lib/stock-uom";

const MATCH_TOLERANCE_KES = 1;

/** Unique GRN reference — prefer supplier delivery note / invoice number when present. */
export function formatGrnNumber({ lpoNo, invoiceNumber, receiptDate = null } = {}) {
  const inv = String(invoiceNumber ?? "").trim();
  if (inv) return `GRN-${inv}`;
  const datePart = String(receiptDate ?? "").slice(0, 10).replace(/-/g, "");
  if (lpoNo && datePart) return `GRN-${lpoNo}-${datePart}`;
  if (lpoNo) return `GRN-${lpoNo}`;
  return "GRN";
}

function resolveUom(line, uomById) {
  if (!line) return null;
  if (line.unit_uom) return line.unit_uom;
  return line.unit_id ? uomById?.get(line.unit_id) ?? null : null;
}

/** Received quantity stored on LPO lines is cumulative base stock units. */
export function receivedBaseOnLine(line, uom) {
  const raw = Number(line?.received_qty ?? 0);
  const factor = uomConversionFactor(uom);
  if (factor <= 1) return raw;
  return raw;
}

export function grnPackQtyFromBase(baseQty, uom) {
  return packQtyFromReceiveBase(Number(baseQty ?? 0), uom);
}

export function grnLineAmount(baseQty, uom, costPerPack) {
  const packQty = grnPackQtyFromBase(baseQty, uom);
  return Math.round(packQty * Number(costPerPack ?? 0) * 100) / 100;
}

function mapGrnLine({
  line,
  uom,
  orderedLabel,
  receivedLabel,
  receivedBase,
  costPerPack,
}) {
  const lineTotal = grnLineAmount(receivedBase, uom, costPerPack);
  return {
    product_code: line.product_code,
    product_name: line.product_name ?? line.product_code,
    ordered_label: orderedLabel,
    received_label: receivedLabel,
    received_base: receivedBase,
    unit_cost: Number(costPerPack ?? 0),
    line_total: lineTotal,
  };
}

/** GRN for a single receive session (quantities entered on the receive screen). */
export function buildGrnFromReceiveSession(lpoSummary, receiveCounts, uomById, options = {}) {
  const lpo = lpoSummary?.lpo ?? {};
  const lines = [];
  const priorReceivedByLineId = options.priorReceivedByLineId ?? {};

  for (const line of lpoSummary?.lines ?? []) {
    const uom = resolveUom(line, uomById);
    const lineKey = String(line.id);
    const receiveBase = receiveBaseForLine(lineKey, uom, receiveCounts);
    if (receiveBase <= 0) continue;

    lines.push(
      mapGrnLine({
        line,
        uom,
        orderedLabel: formatLinePackQty(line.ordered_qty, uom),
        receivedLabel: formatStockQty(receiveBase, uom),
        receivedBase: receiveBase,
        costPerPack: line.cost_price,
      }),
    );
  }

  const grnTotal = lines.reduce((sum, row) => sum + Number(row.line_total ?? 0), 0);
  const supplierInvoices = (lpoSummary?.supplier_invoices ?? []).filter(
    (inv) => Number(inv.lpo_no) === Number(lpo.lpo_no),
  );

  return {
    grn_number: formatGrnNumber({
      lpoNo: lpo.lpo_no,
      invoiceNumber: options.supplierInvoiceNumber,
      receiptDate: options.receiptDate,
    }),
    receipt_date: options.receiptDate ?? new Date().toISOString().slice(0, 10),
    lpo,
    lines,
    grn_total: Math.round(grnTotal * 100) / 100,
    supplier_invoices: supplierInvoices,
    stock_location: options.stockLocation ?? "store",
    received_by: options.receivedBy ?? null,
    reconciliation: computeGrnReconciliation({
      grnTotal,
      poNetAmount: Number(lpo.net_amount ?? lpo.total_amount ?? 0),
      supplierInvoiceAmount: resolveSupplierInvoiceAmount(supplierInvoices, options),
    }),
  };
}

/** GRN for all goods received so far on the purchase order. */
export function buildGrnFromLpoSummary(lpoSummary, uomById, options = {}) {
  const lpo = lpoSummary?.lpo ?? {};
  const lines = [];

  for (const line of lpoSummary?.lines ?? []) {
    const receivedBase = receivedBaseOnLine(line, resolveUom(line, uomById));
    if (receivedBase <= 0) continue;
    const uom = resolveUom(line, uomById);
    lines.push(
      mapGrnLine({
        line,
        uom,
        orderedLabel: formatLinePackQty(line.ordered_qty, uom),
        receivedLabel: formatStockQty(receivedBase, uom),
        receivedBase,
        costPerPack: line.cost_price,
      }),
    );
  }

  const grnTotal = lines.reduce((sum, row) => sum + Number(row.line_total ?? 0), 0);
  const supplierInvoices = (lpoSummary?.supplier_invoices ?? []).filter(
    (inv) => Number(inv.lpo_no) === Number(lpo.lpo_no),
  );

  return {
    grn_number: formatGrnNumber({
      lpoNo: lpo.lpo_no,
      invoiceNumber: options.supplierInvoiceNumber ?? supplierInvoices[0]?.supplier_invoice_number,
      receiptDate: options.receiptDate,
    }),
    receipt_date: options.receiptDate ?? new Date().toISOString().slice(0, 10),
    lpo,
    lines,
    grn_total: Math.round(grnTotal * 100) / 100,
    supplier_invoices: supplierInvoices,
    stock_location: options.stockLocation ?? "store",
    received_by: options.receivedBy ?? null,
    reconciliation: computeGrnReconciliation({
      grnTotal,
      poNetAmount: Number(lpo.net_amount ?? lpo.total_amount ?? 0),
      supplierInvoiceAmount: resolveSupplierInvoiceAmount(supplierInvoices, options),
      receivedPayableTotal: Number(lpo.received_payable_total ?? 0),
    }),
  };
}

/** GRN from grouped stock receipt rows (inventory receipts list). */
export function buildGrnFromStockReceiptGroup(group, { productByCode, uomByProduct, lpoSummary = null } = {}) {
  const lines = (group?.lines ?? []).map((row) => {
    const product = productByCode?.get(row.product_code);
    const uom = uomByProduct?.get(String(row.product_code)) ?? null;
    const receivedBase = Number(row.units_received ?? 0);
    const costPerPack = Number(row.cost_price ?? product?.last_cost_price ?? 0);
    return mapGrnLine({
      line: {
        product_code: row.product_code,
        product_name: product?.product_name ?? row.product_name ?? row.product_code,
      },
      uom,
      orderedLabel: "—",
      receivedLabel: formatStockQty(receivedBase, uom),
      receivedBase,
      costPerPack,
    });
  });

  const grnTotal = lines.reduce((sum, row) => sum + Number(row.line_total ?? 0), 0);
  const lpo = lpoSummary?.lpo ?? null;
  const supplierInvoices = lpoSummary?.supplier_invoices ?? [];

  return {
    grn_number: formatGrnNumber({
      lpoNo: lpo?.lpo_no,
      invoiceNumber: group?.ref,
      receiptDate: group?.date,
    }),
    receipt_date: String(group?.date ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10),
    lpo,
    lines,
    grn_total: Math.round(grnTotal * 100) / 100,
    supplier_invoices: supplierInvoices,
    stock_location: group?.stock_location ?? "store",
    received_by: group?.received_by ?? null,
    reconciliation: computeGrnReconciliation({
      grnTotal,
      poNetAmount: lpo ? Number(lpo.net_amount ?? lpo.total_amount ?? 0) : null,
      supplierInvoiceAmount: resolveSupplierInvoiceAmount(supplierInvoices, {
        supplierInvoiceNumber: group?.ref,
      }),
    }),
  };
}

function resolveSupplierInvoiceAmount(supplierInvoices, options = {}) {
  const explicit = options.supplierInvoiceAmount;
  if (explicit != null && Number.isFinite(Number(explicit))) {
    return Number(explicit);
  }
  const number = String(options.supplierInvoiceNumber ?? "").trim();
  if (number) {
    const match = (supplierInvoices ?? []).find(
      (inv) => String(inv.supplier_invoice_number ?? "").trim() === number,
    );
    if (match?.invoice_amount != null) return Number(match.invoice_amount);
  }
  if ((supplierInvoices ?? []).length === 1) {
    return Number(supplierInvoices[0].invoice_amount ?? 0);
  }
  const total = (supplierInvoices ?? []).reduce(
    (sum, inv) => sum + Number(inv.invoice_amount ?? 0),
    0,
  );
  return total > 0 ? total : null;
}

/**
 * Three-way match summary: GRN value vs supplier invoice and PO total.
 * Industry practice: payment should not proceed until GRN, PO, and invoice align (within tolerance).
 */
export function computeGrnReconciliation({
  grnTotal,
  poNetAmount = null,
  supplierInvoiceAmount = null,
  receivedPayableTotal = null,
} = {}) {
  const grn = Math.round(Number(grnTotal ?? 0) * 100) / 100;
  const invoice =
    supplierInvoiceAmount != null ? Math.round(Number(supplierInvoiceAmount) * 100) / 100 : null;
  const po = poNetAmount != null ? Math.round(Number(poNetAmount) * 100) / 100 : null;
  const payable =
    receivedPayableTotal != null ? Math.round(Number(receivedPayableTotal) * 100) / 100 : null;

  const invoiceVariance = invoice != null ? Math.round((grn - invoice) * 100) / 100 : null;
  const poVariance = po != null ? Math.round((grn - po) * 100) / 100 : null;
  const payableVariance = payable != null ? Math.round((grn - payable) * 100) / 100 : null;

  let status = "Review required";
  let statusTone = "warning";

  if (invoice != null && Math.abs(invoiceVariance) <= MATCH_TOLERANCE_KES) {
    status = "Matched to supplier invoice";
    statusTone = "ok";
  } else if (invoice == null && po != null && Math.abs(poVariance) <= MATCH_TOLERANCE_KES) {
    status = "Matched to PO total";
    statusTone = "ok";
  } else if (
    invoice != null &&
    payable != null &&
    Math.abs(payableVariance) <= MATCH_TOLERANCE_KES &&
    Math.abs(invoiceVariance) <= MATCH_TOLERANCE_KES
  ) {
    status = "Matched to invoice and received payable";
    statusTone = "ok";
  }

  return {
    grn_total: grn,
    po_net_amount: po,
    supplier_invoice_amount: invoice,
    received_payable_total: payable,
    invoice_variance: invoiceVariance,
    po_variance: poVariance,
    payable_variance: payableVariance,
    status,
    status_tone: statusTone,
    tolerance_kes: MATCH_TOLERANCE_KES,
  };
}

export function lpoHasReceivedStock(lpoSummary) {
  return (lpoSummary?.lines ?? []).some((line) => Number(line.received_qty ?? 0) > 0);
}

export function lpoDisplayLabel(lpo) {
  if (!lpo) return "—";
  return lpo.po_number ?? lpoDisplayNumber(lpo);
}
