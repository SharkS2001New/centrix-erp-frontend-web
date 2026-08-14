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
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import { formatReceiptNumber } from "@/lib/sales";
import { resolveOrgDocumentTemplateId } from "@/lib/document-print-templates";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { mergeSalesSettings } from "@/lib/sales-settings";
import { brandingWithDocumentLogo } from "@/lib/document-logo-settings";

const KRA_REFUND_REASONS = {
  "01": "Missing Quantity",
  "02": "Missing Data",
  "03": "Damaged / Wasted",
  "04": "Raw Material",
  "05": "Shortage",
  "06": "Refund",
};

function resolveCreditNoteDocumentTemplateId(salesSettings) {
  return resolveOrgDocumentTemplateId(salesSettings?.credit_note_document_template);
}

function resolveCreditNoteFooterText(generalSettings, documentFooterText) {
  if (documentFooterText != null && String(documentFooterText).trim() !== "") {
    return String(documentFooterText);
  }
  if (!generalSettings) return "";
  return resolvePrintFooter(generalSettings, "credit_note") || "";
}

function resolveCustomerReturnReason(customerReturn, creditNote) {
  const refundReasonCode = creditNote?.kra_refund_reason_code ?? "";
  if (refundReasonCode && KRA_REFUND_REASONS[refundReasonCode]) {
    return KRA_REFUND_REASONS[refundReasonCode];
  }
  return customerReturn?.reason ?? customerReturn?.return_reason ?? "—";
}

function buildCustomerReturnLineRows(lines, uomById, customerReturn) {
  const legacyOptions =
    customerReturn?.return_kind === "legacy" ||
    customerReturn?.display_uom_mode === "legacy"
      ? { returnKind: "legacy" }
      : {};

  return (lines ?? []).map((line) => {
    const qty = customerReturnLineQtyLabel(line, uomById, "return_qty", legacyOptions);
    const amount = Number(line.amount ?? 0);
    const returnQty = Number(line.return_qty ?? line.quantity ?? 0);
    const storedDisplay = Number(line.display_unit_price ?? line.unit_price ?? 0);
    const unitPrice =
      returnQty > 0 && amount > 0
        ? Math.round((amount / returnQty) * 100) / 100
        : Number.isFinite(storedDisplay)
          ? storedDisplay
          : 0;
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
  let lines = customerReturn.lines ?? [];
  if (!lines.length) {
    const fallbackTotal = Number(customerReturn.total_amount ?? 0);
    if (fallbackTotal > 0) {
      lines = [
        {
          product_name: reason !== "—" ? reason : "Credit adjustment",
          return_qty: 1,
          quantity: 1,
          unit_price: fallbackTotal,
          amount: fallbackTotal,
        },
      ];
    }
  }
  const lineRows = buildCustomerReturnLineRows(lines, uomById, customerReturn);
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
    { label: "CREDIT NOTE NO:", value: documentNo },
    { label: "RETURN REF NO #:", value: customerReturn.return_no ?? "—" },
    { label: "CUSTOMER NAME:", value: customerName },
    { label: "PHONE NUMBER:", value: customer?.phone_number ?? customer?.additional_phone ?? "—" },
    { label: "CREDIT DATE:", value: returnDate },
    { label: "K.R.A Pin:", value: customer?.kra_pin ?? "—" },
    {
      label: "TERMS OF PAYMENT:",
      value: customer?.terms_of_payment ?? customerReturn.refund_method ?? "—",
    },
    { label: "ORIGINAL INVOICE:", value: originalInvoice },
  ]);

  const itemsTable = buildDocItemsTable({
    columns: [
      { key: "description", label: "ITEMS" },
      { key: "qty", label: "QUANTITY", align: "right" },
      { key: "unitPrice", label: "UNIT PRICE", align: "right" },
      { key: "amount", label: "AMOUNT", align: "right" },
    ],
    rows: lineRows,
    emptyLabel: "No credited items",
  });

  const refundMethod = customerReturn.refund_method ?? "CASH";
  const processedBy = customerReturn.processed_by_name ?? customerReturn.created_by_name ?? "—";
  const footerPrintedBy = resolvePrintedByUser(printedBy) ?? "—";

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
    printedBy: footerPrintedBy,
  };
}

export async function printCustomerReturn(
  customerReturn,
  {
    organization = null,
    generalSettings = null,
    salesSettings = null,
    moduleSettings = null,
    uomById = null,
    kraEnabled = true,
    printedBy = null,
    user = null,
  } = {},
) {
  if (!customerReturn) return;

  const branding = brandingWithDocumentLogo(
    resolveDocumentBranding({ organization, generalSettings }),
    generalSettings,
    "credit_note",
  );
  const hasCreditNote = Boolean(customerReturn.credit_note ?? customerReturn.creditNote);
  const resolvedPrintedBy = resolvePrintedByUser(printedBy ?? user);
  const { title, bodyHtml, printedBy: byName } = await buildCustomerReturnDocumentBody(
    customerReturn,
    {
      title: hasCreditNote ? "CREDIT NOTE" : "CUSTOMER RETURN",
      uomById,
      kraEnabled: hasCreditNote && kraEnabled,
      printedBy: resolvedPrintedBy,
    },
  );

  const sales = salesSettings ?? mergeSalesSettings(moduleSettings);
  const documentTemplateId = hasCreditNote
    ? resolveCreditNoteDocumentTemplateId(sales)
    : null;
  const documentFooterText = hasCreditNote
    ? resolveCreditNoteFooterText(generalSettings)
    : branding.documentFooterText;

  printBrandedA4Document({
    title,
    branding,
    organization,
    generalSettings,
    bodyHtml,
    printedBy: byName,
    documentFooterText,
    documentTemplateId,
  });
}

export async function printCreditNote(
  customerReturn,
  {
    organization = null,
    generalSettings = null,
    salesSettings = null,
    moduleSettings = null,
    organizationName = null,
    branch = null,
    uomById = null,
    kraEnabled = true,
    printedBy = null,
    user = null,
  } = {},
) {
  if (!customerReturn) return;

  const branding = brandingWithDocumentLogo(
    resolveDocumentBranding({ organization, generalSettings }),
    generalSettings,
    "credit_note",
  );
  if (!branding.organizationName && organizationName) {
    branding.organizationName = organizationName;
    branding.watermarkText = organizationName;
  }

  const resolvedPrintedBy = resolvePrintedByUser(printedBy ?? user);
  const { title, bodyHtml, printedBy: byName } = await buildCustomerReturnDocumentBody(
    customerReturn,
    {
      title: "CREDIT NOTE",
      uomById,
      kraEnabled,
      printedBy: resolvedPrintedBy,
    },
  );

  const sales = salesSettings ?? mergeSalesSettings(moduleSettings);
  printBrandedA4Document({
    title,
    branding,
    organization,
    generalSettings,
    bodyHtml,
    printedBy: byName,
    documentFooterText: resolveCreditNoteFooterText(generalSettings),
    documentTemplateId: resolveCreditNoteDocumentTemplateId(sales),
  });
}

export async function buildCreditNotePrintHtml(
  customerReturn,
  {
    organization = null,
    generalSettings = null,
    salesSettings = null,
    moduleSettings = null,
    uomById = null,
    kraEnabled = false,
    printedBy = null,
    title = "CREDIT NOTE",
  } = {},
) {
  const branding = resolveDocumentBranding({ organization, generalSettings });
  const { title: resolvedTitle, bodyHtml, printedBy: byName } =
    await buildCustomerReturnDocumentBody(customerReturn, {
      title,
      uomById,
      kraEnabled,
      printedBy,
    });
  const sales = salesSettings ?? mergeSalesSettings(moduleSettings);
  return buildBrandedA4DocumentHtml({
    title: resolvedTitle,
    branding,
    organization,
    generalSettings,
    bodyHtml,
    printedBy: byName,
    documentFooterText: resolveCreditNoteFooterText(generalSettings),
    documentTemplateId: resolveCreditNoteDocumentTemplateId(sales),
  });
}

export function sampleCreditNotePreviewDocument() {
  return {
    return_no: "CN-PREVIEW-001",
    return_date: new Date().toISOString().slice(0, 10),
    refund_method: "CASH",
    reason: "Price adjustment / overcharge",
    total_amount: 1500,
    processed_by_name: "Preview Cashier",
    credit_note: {
      credit_note_no: "CN-PREVIEW-001",
      credit_date: new Date().toISOString().slice(0, 10),
    },
    customer: {
      customer_name: "Walk-in customer",
      phone_number: "0700 000 000",
      kra_pin: "P000000000X",
    },
    sale: {
      order_num: 1001,
      pos_order_num: 42,
    },
    lines: [
      {
        product_code: "SKU-001",
        product_name: "Sample product A",
        return_qty: 2,
        quantity: 2,
        unit_price: 500,
        amount: 1000,
        uom: "PCS",
      },
      {
        product_code: "SKU-002",
        product_name: "Sample product B",
        return_qty: 1,
        quantity: 1,
        unit_price: 500,
        amount: 500,
        uom: "PCS",
      },
    ],
  };
}

export function buildCreditNotePreviewHtml(customerReturn, options = {}) {
  const doc = customerReturn ?? sampleCreditNotePreviewDocument();
  const sales = options.salesSettings ?? mergeSalesSettings(options.moduleSettings);
  const branding = brandingWithDocumentLogo(
    resolveDocumentBranding({
      organization: options.organization ?? null,
      generalSettings: options.generalSettings ?? null,
    }),
    options.generalSettings ?? null,
    "credit_note",
  );

  // Sync preview body (no KRA QR) so Admin → Printouts can live-update.
  const syncBody = (() => {
    // Re-use the same visual structure as print without awaiting QR.
    const creditNote = doc.credit_note ?? doc.creditNote ?? null;
    const lines = doc.lines ?? [];
    const sale = doc.sale ?? null;
    const customer = doc.customer ?? sale?.customer ?? null;
    const customerName =
      customer?.customer_name ?? sale?.customer_name_override ?? "Walk-in customer";
    const documentNo = creditNote?.credit_note_no ?? doc.return_no ?? "—";
    const originalInvoice = sale ? formatReceiptNumber(sale) : "—";
    const returnDate = formatDocDate(
      creditNote?.credit_date ?? doc.return_date ?? doc.created_at,
    );
    const reason = resolveCustomerReturnReason(doc, creditNote);
    const lineRows = buildCustomerReturnLineRows(lines, options.uomById ?? null, doc);
    const totalAmount =
      Number(doc.total_amount ?? 0) || lineRows.reduce((s, r) => s + r._amount, 0);
    const leftMeta = buildMetaFieldRows([
      { label: "CREDIT NOTE NO:", value: documentNo },
      { label: "RETURN REF NO #:", value: doc.return_no ?? "—" },
      { label: "CUSTOMER NAME:", value: customerName },
      { label: "PHONE NUMBER:", value: customer?.phone_number ?? customer?.additional_phone ?? "—" },
      { label: "CREDIT DATE:", value: returnDate },
      { label: "K.R.A Pin:", value: customer?.kra_pin ?? "—" },
      {
        label: "TERMS OF PAYMENT:",
        value: customer?.terms_of_payment ?? doc.refund_method ?? "—",
      },
      { label: "ORIGINAL INVOICE:", value: originalInvoice },
    ]);
    const itemsTable = buildDocItemsTable({
      columns: [
        { key: "description", label: "ITEMS" },
        { key: "qty", label: "QUANTITY", align: "right" },
        { key: "unitPrice", label: "UNIT PRICE", align: "right" },
        { key: "amount", label: "AMOUNT", align: "right" },
      ],
      rows: lineRows,
      emptyLabel: "No credited items",
    });
    const refundMethod = doc.refund_method ?? "CASH";
    const processedBy = doc.processed_by_name ?? doc.created_by_name ?? "—";
    return `
      <div class="meta-block">${leftMeta}</div>
      ${itemsTable}
      <div class="totals-row">
        <div class="totals-box">
          <p><strong>TOTAL AMOUNT:</strong> ${escapeHtml(formatDocAmount(totalAmount))}</p>
          <p><strong>REFUND METHOD:</strong> ${escapeHtml(refundMethod)}</p>
        </div>
      </div>
      <div class="reason-row">
        <span class="meta-label">REASONS TO RETURN :</span>
        <span>${escapeHtml(reason)}</span>
      </div>
      <div class="signatures">
        <p>Returned By: <span class="sig-line">${escapeHtml(processedBy)}</span></p>
        <p>Signature: <span class="sig-line">&nbsp;</span></p>
      </div>
    `;
  })();

  return buildBrandedA4DocumentHtml({
    title: options.title ?? "CREDIT NOTE",
    branding,
    organization: options.organization ?? null,
    generalSettings: options.generalSettings ?? null,
    bodyHtml: syncBody,
    printedBy: options.printedBy ?? "Preview",
    documentFooterText: resolveCreditNoteFooterText(options.generalSettings),
    documentTemplateId: resolveCreditNoteDocumentTemplateId(sales),
  });
}

export function buildCustomerReturnPrintPreviewHtml(customerReturn, options = {}) {
  return buildBrandedA4DocumentHtml({
    title: options.title ?? "CUSTOMER RETURN",
    branding: resolveDocumentBranding(options),
    organization: options.organization ?? null,
    bodyHtml: "<p>Preview not available — use print.</p>",
    printedBy: options.printedBy ?? null,
    documentTemplateId: options.documentTemplateId ?? null,
  });
}
