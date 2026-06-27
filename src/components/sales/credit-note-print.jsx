import { customerReturnLineQtyLabel } from "@/components/sales/customer-returns-shared";
import {
  buildBrandedA4DocumentHtml,
  buildDocItemsTable,
  buildMetaFieldRows,
  escapeHtml,
  formatDocAmount,
  formatDocDate,
  printBrandedA4Document,
  resolveDocumentBranding,
} from "@/lib/branded-document-print";
import {
  buildKraFiscalBlockHtml,
  extractKraReceiptData,
  kraReceiptQrDataUrl,
} from "@/lib/kra-receipt-qr";
import { formatReceiptNumber } from "@/lib/sales";

const KRA_REFUND_REASONS = {
  "01": "Missing Quantity",
  "02": "Missing Data",
  "03": "Damaged / Wasted",
  "04": "Raw Material",
  "05": "Shortage",
  "06": "Refund",
};

function resolveCustomerReturnReason(customerReturn, creditNote) {
  const refundReasonCode = creditNote?.kra_refund_reason_code ?? "";
  if (refundReasonCode && KRA_REFUND_REASONS[refundReasonCode]) {
    return KRA_REFUND_REASONS[refundReasonCode];
  }
  return customerReturn?.reason ?? customerReturn?.return_reason ?? "—";
}

function buildCustomerReturnLineRows(lines, uomById) {
  return (lines ?? []).map((line) => {
    const qty = customerReturnLineQtyLabel(line, uomById, "return_qty");
    const unitPrice = Number(line.unit_price ?? 0);
    const amount = Number(line.amount ?? 0);
    return {
      description: line.product_name ?? line.product_code ?? "—",
      qty,
      unitPrice: formatDocAmount(unitPrice),
      amount: formatDocAmount(amount),
      _amount: amount,
    };
  });
}

async function buildCustomerReturnDocumentBody(customerReturn, options = {}) {
  const {
    title = "CUSTOMER RETURN",
    uomById = null,
    kraEnabled = true,
    printedBy = null,
  } = options;

  const creditNote = customerReturn.credit_note ?? customerReturn.creditNote ?? null;
  const lines = customerReturn.lines ?? [];
  const sale = customerReturn.sale ?? null;
  const customer = customerReturn.customer ?? sale?.customer ?? null;
  const customerName =
    customer?.customer_name ?? sale?.customer_name_override ?? "Walk-in customer";
  const documentNo = creditNote?.credit_note_no ?? customerReturn.return_no ?? "—";
  const originalInvoice = sale ? formatReceiptNumber(sale) : "—";
  const returnDate = formatDocDate(
    creditNote?.credit_date ?? customerReturn.return_date ?? customerReturn.created_at,
  );
  const reason = resolveCustomerReturnReason(customerReturn, creditNote);
  const lineRows = buildCustomerReturnLineRows(lines, uomById);
  const totalAmount = Number(customerReturn.total_amount ?? 0) || lineRows.reduce((s, r) => s + r._amount, 0);

  const kraSource =
    creditNote?.kra_status === "success"
      ? {
          invoice_number: creditNote.kra_cu_inv_no ?? creditNote.kra_invoice_number,
          receipt_signature: creditNote.kra_receipt_signature,
          signature_link: creditNote.kra_signature_link,
          serial_number: creditNote.kra_serial_number,
          kra_timestamp: creditNote.kra_timestamp,
        }
      : null;
  const kraData = kraEnabled ? extractKraReceiptData(null, kraSource) : null;
  const kraQrDataUrl =
    kraData?.signatureLink != null
      ? await kraReceiptQrDataUrl(kraData.signatureLink, { size: 96 })
      : null;

  const kraBlock =
    kraData != null
      ? `<div style="margin:10px 0;">${buildKraFiscalBlockHtml(kraData, {
          layout: "a4",
          qrDataUrl: kraQrDataUrl,
          title: title === "CREDIT NOTE" ? "KRA FISCAL CREDIT NOTE" : "KRA FISCAL RETURN",
        })}${
          creditNote?.kra_relevant_invoice_number
            ? `<div style="font-size:9px;text-align:center;margin-top:4px;">Original CU Invoice: ${escapeHtml(String(creditNote.kra_relevant_invoice_number))}</div>`
            : ""
        }</div>`
      : "";

  const leftMeta = buildMetaFieldRows([
    { label: "RETURN REF NO #:", value: customerReturn.return_no ?? "—" },
    { label: "CUSTOMER NAME:", value: customerName },
    { label: "PHONE NUMBER:", value: customer?.phone_number ?? customer?.additional_phone ?? "—" },
    { label: "RETURN DATE:", value: returnDate },
    { label: "K.R.A Pin:", value: customer?.kra_pin ?? "—" },
    {
      label: "TERMS OF PAYMENT:",
      value: customer?.terms_of_payment ?? customerReturn.refund_method ?? "—",
    },
    { label: "ORIGINAL INVOICE:", value: originalInvoice },
    { label: "DOCUMENT NO:", value: documentNo },
  ]);

  const itemsTable = buildDocItemsTable({
    columns: [
      { key: "description", label: "ITEMS" },
      { key: "qty", label: "QUANTITY", align: "right" },
      { key: "unitPrice", label: "UNIT PRICE", align: "right" },
      { key: "amount", label: "AMOUNT", align: "right" },
    ],
    rows: lineRows,
    emptyLabel: "No returned items",
  });

  const refundMethod = customerReturn.refund_method ?? "CASH";
  const processedBy = customerReturn.processed_by_name ?? customerReturn.created_by_name ?? printedBy ?? "—";

  return {
    title,
    bodyHtml: `
      <div class="meta-block">${leftMeta}</div>
      ${itemsTable}
      <div class="totals-row">
        <div class="totals-box">
          <p><strong>TOTAL AMOUNT:</strong> ${escapeHtml(formatDocAmount(totalAmount))}</p>
          ${title === "CREDIT NOTE" ? `<p><strong>REFUND METHOD:</strong> ${escapeHtml(refundMethod)}</p>` : ""}
        </div>
      </div>
      <div class="reason-row">
        <span class="meta-label">REASONS TO RETURN :</span>
        <span>${escapeHtml(reason)}</span>
      </div>
      ${kraBlock}
      <div class="signatures">
        <p>Returned By: <span class="sig-line">${escapeHtml(processedBy)}</span></p>
        <p>Signature: <span class="sig-line">&nbsp;</span></p>
      </div>
    `,
    printedBy: printedBy ?? processedBy,
  };
}

export async function printCustomerReturn(
  customerReturn,
  {
    organization = null,
    generalSettings = null,
    uomById = null,
    kraEnabled = true,
    printedBy = null,
  } = {},
) {
  if (!customerReturn) return;

  const branding = resolveDocumentBranding({ organization, generalSettings });
  const hasCreditNote = Boolean(customerReturn.credit_note ?? customerReturn.creditNote);
  const { title, bodyHtml, printedBy: byName } = await buildCustomerReturnDocumentBody(
    customerReturn,
    {
      title: hasCreditNote ? "CREDIT NOTE" : "CUSTOMER RETURN",
      uomById,
      kraEnabled: hasCreditNote && kraEnabled,
      printedBy,
    },
  );

  printBrandedA4Document({
    title,
    branding,
    organization,
    bodyHtml,
    printedBy: byName,
    documentFooterText: branding.documentFooterText,
  });
}

export async function printCreditNote(
  customerReturn,
  {
    organization = null,
    generalSettings = null,
    organizationName = null,
    branch = null,
    uomById = null,
    kraEnabled = true,
    printedBy = null,
  } = {},
) {
  if (!customerReturn) return;

  const branding = resolveDocumentBranding({ organization, generalSettings });
  if (!branding.organizationName && organizationName) {
    branding.organizationName = organizationName;
    branding.watermarkText = organizationName;
  }

  const { title, bodyHtml, printedBy: byName } = await buildCustomerReturnDocumentBody(
    customerReturn,
    {
      title: "CREDIT NOTE",
      uomById,
      kraEnabled,
      printedBy: printedBy ?? branch?.name ?? null,
    },
  );

  printBrandedA4Document({
    title,
    branding,
    organization,
    bodyHtml,
    printedBy: byName,
    documentFooterText: branding.documentFooterText,
  });
}

export function buildCustomerReturnPrintPreviewHtml(customerReturn, options = {}) {
  return buildBrandedA4DocumentHtml({
    title: options.title ?? "CUSTOMER RETURN",
    branding: resolveDocumentBranding(options),
    organization: options.organization ?? null,
    bodyHtml: "<p>Preview not available — use print.</p>",
    printedBy: options.printedBy ?? null,
  });
}
