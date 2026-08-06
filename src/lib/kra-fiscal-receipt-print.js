import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import {
  buildKraFiscalBlockHtml,
  escapeKraHtml,
  extractKraReceiptData,
  kraReceiptQrDataUrl,
} from "@/lib/kra-receipt-qr";
import { openBlankPrintWindow, PRINT_BLOCKED_MESSAGE } from "@/lib/open-print-window";
import { dispatchPrintJob } from "@/lib/print-dispatch";
import { formatReportKes } from "@/lib/reports/format";
import { formatKraReportOrderNo, saleCustomerLabel } from "@/lib/sales";
import { salesChannelLabel } from "@/lib/user-facing-labels";

function parseJsonMaybe(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function formatReceiptMoney(value) {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatReceiptDate(value) {
  if (!value) return "—";
  const text = String(value);
  const d = new Date(text.includes("T") ? text : `${text}T12:00:00`);
  if (Number.isNaN(d.getTime())) return text;
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Line items from KRA device request payload (plu_data). */
export function parseKraPluLines(requestPayload) {
  const payload = parseJsonMaybe(requestPayload);
  const raw = payload?.plu_data ?? payload?.PluData ?? [];
  if (!Array.isArray(raw)) return [];

  return raw.map((line) => {
    const qty = Number(line?.SaleQty ?? line?.sale_qty ?? 0);
    const unitPrice = Number(line?.SalePrice ?? line?.sale_price ?? 0);
    const amountRaw = line?.SaleAmount ?? line?.sale_amount;
    const amount =
      amountRaw != null && amountRaw !== ""
        ? Number(amountRaw)
        : Number.isFinite(qty) && Number.isFinite(unitPrice)
          ? qty * unitPrice
          : 0;

    return {
      name: String(line?.item_Name ?? line?.ItemName ?? line?.product_name ?? "Item").trim() || "Item",
      qty: Number.isFinite(qty) ? qty : 0,
      unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
      amount: Number.isFinite(amount) ? amount : 0,
      levy: Number(line?.Levy ?? 0) || 0,
    };
  });
}

function extractBuyerPinFromKraPayload(requestPayload) {
  const payload = parseJsonMaybe(requestPayload);
  if (!payload) return null;
  const sign = payload.sign_structure ?? payload.SignStructure ?? null;
  const pin = sign?.pinOfBuyer ?? sign?.PinOfBuyer ?? payload.pinOfBuyer ?? null;
  const trimmed = String(pin ?? "").trim();
  return trimmed || null;
}

function extractCustomerNameFromRow(row) {
  if (!row) return null;
  const fromRow = String(row.customer_name ?? "").trim();
  if (fromRow) return fromRow;
  return saleCustomerLabel(row);
}

function extractServedByFromRow(row) {
  if (!row) return null;
  const fromRow = String(row.cashier_name ?? row.served_by ?? "").trim();
  if (fromRow) return fromRow;
  const nested = row.sale?.cashier;
  if (nested && typeof nested === "object") {
    const fullName = String(nested.full_name ?? "").trim();
    if (fullName) return fullName;
    const username = String(nested.username ?? "").trim();
    if (username) return username;
  }
  return null;
}

export function kraReportRowId(row) {
  return row?.kra_response_id ?? row?.id ?? null;
}

/** Align report rows and KRA response API records for preview/print. */
export function normalizeKraResponseRow(row) {
  if (!row) return null;
  const id = kraReportRowId(row);
  return {
    ...row,
    id,
    kra_response_id: id,
    receipt_date: row.receipt_date ?? (row.created_at ? String(row.created_at).slice(0, 10) : null),
    receipt_at: row.receipt_at ?? row.created_at ?? null,
  };
}

/** Normalize a KRA receipts report row for preview/print. */
export function enrichKraReportRow(row) {
  const normalized = normalizeKraResponseRow(row);
  if (!normalized) return null;

  const requestPayload = parseJsonMaybe(normalized.request_payload);
  const responsePayload = parseJsonMaybe(normalized.response_payload);
  const kra = extractKraReceiptData(null, {
    ...normalized,
    response_payload: responsePayload,
  });

  const lines = parseKraPluLines(requestPayload);
  const linesTotal = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const orderTotal = Number(normalized.order_total ?? 0);
  const totalVat = Number(normalized.total_vat ?? 0);
  const documentType = resolveKraDocumentType(normalized, requestPayload, responsePayload);
  const relevantInvoiceNumber =
    String(
      normalized.relevant_invoice_number ??
        responsePayload?.relevant_invoice_number ??
        requestPayload?.sign_structure?.relevantInvoiceNumber ??
        "",
    ).trim() || null;

  return {
    row: normalized,
    kra,
    requestPayload,
    responsePayload,
    lines,
    documentType,
    isCreditNote: documentType === "credit_note",
    relevantInvoiceNumber,
    orderNo: formatKraReportOrderNo(normalized),
    customerName: extractCustomerNameFromRow(normalized),
    servedBy: extractServedByFromRow(normalized),
    buyerPin: extractBuyerPinFromKraPayload(requestPayload),
    orderTotal: Number.isFinite(orderTotal) ? orderTotal : linesTotal,
    totalVat: Number.isFinite(totalVat) ? totalVat : lines.reduce((sum, line) => sum + line.levy, 0),
    receiptDate: normalized.kra_timestamp ?? normalized.receipt_at ?? normalized.receipt_date,
    branchName: normalized.branch_name,
    channel: salesChannelLabel(normalized.channel) || normalized.channel,
    status: normalized.status,
    scuId: kra?.scuId ?? responsePayload?.scu_id ?? null,
    cuInvNo: kra?.cuInvNo ?? responsePayload?.cu_inv_no ?? null,
    internalData: kra?.internalData ?? responsePayload?.internal_data ?? null,
    version: kra?.version ?? responsePayload?.version ?? null,
    errorMessage: normalized.error_message,
  };
}

export function resolveKraDocumentType(row, requestPayload = null, responsePayload = null) {
  const request = requestPayload ?? parseJsonMaybe(row?.request_payload);
  const response = responsePayload ?? parseJsonMaybe(row?.response_payload);
  const fromRow = String(row?.document_type ?? "").trim().toLowerCase();
  const fromResponse = String(response?.document_type ?? "").trim().toLowerCase();
  const invoiceType = String(request?.sign_structure?.InvoiceType ?? "").trim().toLowerCase();
  const raw = fromRow || fromResponse || invoiceType || "sale";
  if (raw === "credit" || raw === "credit_note" || raw === "creditnote") return "credit_note";
  return "sale";
}

export function kraDocumentTypeLabel(rowOrType) {
  const type =
    typeof rowOrType === "string" || rowOrType == null
      ? resolveKraDocumentType({ document_type: rowOrType })
      : resolveKraDocumentType(rowOrType);
  return type === "credit_note" ? "Credit note" : "Invoice sale";
}

export function isKraCreditNoteRow(row) {
  return resolveKraDocumentType(row) === "credit_note";
}

export function isKraOriginalInvoiceSaleRow(row) {
  return (
    String(row?.status ?? "").toLowerCase() === "success" &&
    Boolean(row?.sale_id) &&
    !isKraCreditNoteRow(row)
  );
}

function buildLineItemsHtml(lines) {
  if (!lines.length) {
    return `<tr><td colspan="4" style="padding:6px 0;text-align:center;font-size:10px;color:#64748b;">No line items in KRA payload</td></tr>`;
  }

  return lines
    .map((line) => {
      const qty = formatReceiptMoney(line.qty).replace(/\.00$/, "");
      return `<tr>
        <td style="padding:4px 0;font-size:10px;vertical-align:top;">${escapeKraHtml(line.name)}</td>
        <td style="padding:4px 0;font-size:10px;text-align:right;vertical-align:top;">${escapeKraHtml(qty)}</td>
        <td style="padding:4px 0;font-size:10px;text-align:right;vertical-align:top;">${escapeKraHtml(formatReceiptMoney(line.unitPrice))}</td>
        <td style="padding:4px 0;font-size:10px;text-align:right;vertical-align:top;">${escapeKraHtml(formatReceiptMoney(line.amount))}</td>
      </tr>`;
    })
    .join("");
}

function buildMetaRow(label, value) {
  if (value == null || value === "") return "";
  return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:10px;margin:2px 0;">
    <span style="color:#475569;">${escapeKraHtml(label)}</span>
    <span style="font-family:ui-monospace,Menlo,monospace;text-align:right;">${escapeKraHtml(value)}</span>
  </div>`;
}

/** Build printable HTML for one KRA fiscal receipt (thermal-style). */
export function buildKraFiscalReceiptHtml(enriched, { qrDataUrl = null, orgName = DEFAULT_PRINT_ORG_NAME } = {}) {
  if (!enriched) return "";

  const {
    kra,
    lines,
    orderNo,
    orderTotal,
    totalVat,
    receiptDate,
    branchName,
    channel,
    customerName,
    buyerPin,
    servedBy,
    isCreditNote,
    relevantInvoiceNumber,
  } = enriched;
  const documentTitle = isCreditNote ? "KRA FISCAL CREDIT NOTE" : "KRA FISCAL TAX INVOICE";
  const fiscalTitle = isCreditNote ? "KRA eTIMS FISCAL CREDIT NOTE" : "KRA eTIMS FISCAL RECEIPT";
  const fiscalBlock = buildKraFiscalBlockHtml(kra, {
    layout: "thermal",
    qrDataUrl,
    title: fiscalTitle,
  });

  const netExVat = Math.max(0, (Number(orderTotal) || 0) - (Number(totalVat) || 0));

  return `<section class="kra-fiscal-receipt" style="width:72mm;max-width:72mm;margin:0 auto;padding:8px 6px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <div style="text-align:center;margin-bottom:8px;">
      <div style="font-size:12px;font-weight:700;">${escapeKraHtml(orgName)}</div>
      <div style="font-size:11px;font-weight:700;margin-top:4px;letter-spacing:0.04em;">${escapeKraHtml(documentTitle)}</div>
      ${branchName ? `<div style="font-size:10px;margin-top:2px;">${escapeKraHtml(branchName)}</div>` : ""}
    </div>

    <div style="border-top:1px dashed #94a3b8;border-bottom:1px dashed #94a3b8;padding:6px 0;margin-bottom:8px;">
      ${buildMetaRow("Date", formatReceiptDate(receiptDate))}
      ${buildMetaRow("Order #", orderNo != null ? String(orderNo) : null)}
      ${buildMetaRow("Customer", customerName)}
      ${buyerPin ? buildMetaRow("Customer PIN", buyerPin) : ""}
      ${buildMetaRow("Channel", channel)}
      ${buildMetaRow("Type", isCreditNote ? "Credit note" : "Invoice sale")}
      ${relevantInvoiceNumber ? buildMetaRow("Original CU", relevantInvoiceNumber) : ""}
      ${buildMetaRow("CU invoice", kra?.invoiceNumber)}
      ${buildMetaRow("SCU ID", enriched.scuId)}
      ${buildMetaRow("SCU serial", kra?.serialNumber)}
      ${buildMetaRow("CU inv no", enriched.cuInvNo)}
      ${buildMetaRow("Status", enriched.status)}
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
      <thead>
        <tr style="border-bottom:1px solid #cbd5e1;">
          <th style="padding:2px 0;font-size:9px;text-align:left;">Item</th>
          <th style="padding:2px 0;font-size:9px;text-align:right;">Qty</th>
          <th style="padding:2px 0;font-size:9px;text-align:right;">Price</th>
          <th style="padding:2px 0;font-size:9px;text-align:right;">Amount</th>
        </tr>
      </thead>
      <tbody>${buildLineItemsHtml(lines)}</tbody>
    </table>

    <div style="border-top:1px dashed #94a3b8;padding-top:6px;margin-bottom:4px;">
      ${buildMetaRow("Net (ex VAT)", `KES ${formatReceiptMoney(netExVat)}`)}
      ${buildMetaRow("VAT", `KES ${formatReceiptMoney(totalVat)}`)}
      <div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;font-weight:700;margin-top:4px;">
        <span>${isCreditNote ? "Credit total" : "Total"}</span>
        <span>KES ${escapeKraHtml(formatReceiptMoney(orderTotal))}</span>
      </div>
    </div>

    ${servedBy ? `<div style="margin:6px 0 4px;font-size:10px;text-align:center;">Served by: ${escapeKraHtml(servedBy)}</div>` : ""}

    ${fiscalBlock}

    ${enriched.internalData ? `<div style="margin-top:6px;font-size:8px;word-break:break-all;text-align:center;">${escapeKraHtml(enriched.internalData)}</div>` : ""}
    ${enriched.version ? `<div style="margin-top:4px;font-size:8px;text-align:center;color:#64748b;">${escapeKraHtml(enriched.version)}</div>` : ""}
  </section>`;
}

export function buildKraFiscalReceiptPrintDocument(receiptsHtml, { title = "KRA fiscal receipts" } = {}) {
  const body = Array.isArray(receiptsHtml) ? receiptsHtml.filter(Boolean).join("") : receiptsHtml;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeKraHtml(title)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    html, body { margin: 0; padding: 0; background: #fff; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .kra-fiscal-receipt + .kra-fiscal-receipt { page-break-before: always; break-before: page; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

export async function buildKraFiscalReceiptDocuments(rows, { orgName = DEFAULT_PRINT_ORG_NAME } = {}) {
  const enriched = (rows ?? []).map(enrichKraReportRow).filter(Boolean);
  const qrUrls = await Promise.all(
    enriched.map((entry) =>
      entry.kra?.signatureLink ? kraReceiptQrDataUrl(entry.kra.signatureLink, { size: 140 }) : Promise.resolve(null),
    ),
  );

  return enriched.map((entry, index) =>
    buildKraFiscalReceiptHtml(entry, { qrDataUrl: qrUrls[index], orgName }),
  );
}

/** Print one or many KRA fiscal receipts. Returns false when the browser blocked the print window. */
export async function printKraFiscalReceipts(rows, { orgName = DEFAULT_PRINT_ORG_NAME, title } = {}) {
  const printable = (rows ?? []).filter((row) => String(row?.status ?? "").toLowerCase() === "success");
  if (!printable.length) {
    throw new Error("Select successful KRA receipts to print.");
  }

  const documents = await buildKraFiscalReceiptDocuments(printable, { orgName });
  if (!documents.length) {
    throw new Error("No printable KRA receipt content was found.");
  }

  const html = buildKraFiscalReceiptPrintDocument(documents.join(""), {
    title: title ?? (documents.length === 1 ? "KRA fiscal receipt" : `KRA fiscal receipts (${documents.length})`),
  });

  const printWindow = openBlankPrintWindow("width=420,height=720");
  if (!printWindow) {
    throw new Error(PRINT_BLOCKED_MESSAGE);
  }

  await dispatchPrintJob({ html, copies: 1, jobType: "receipt", printWindow });

  return true;
}

export function formatKraReceiptPreviewSummary(enriched) {
  if (!enriched) return null;
  return {
    orderLabel: enriched.orderNo != null ? `#${enriched.orderNo}` : "—",
    totalLabel: formatReportKes(enriched.orderTotal),
    vatLabel: formatReportKes(enriched.totalVat),
    lineCount: enriched.lines.length,
  };
}
