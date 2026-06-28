import { buildKraDocumentQrHtml } from "@/lib/kra-receipt-qr";
import { openPrintWindow, fillPrintWindow } from "@/lib/open-print-window";
import {
  buildSaleDocumentLineRows,
  buildSaleDocumentOrgHeaderHtml,
  buildSaleDocumentTableHead,
  escapeHtml,
  formatPrintAmount,
  saleDocumentDiscountTotals,
  shouldShowPrintDiscountColumn,
} from "@/lib/sale-document-print-shared";
import {
  resolveInvoiceDeliveryTerms,
  resolveInvoiceFooterLines,
} from "@/lib/invoice-print-settings";
import { buildReceiptPaymentDetailsHtml } from "@/lib/receipt-payment-details";
import { formatReceiptNumber, saleCustomerLabel, salePaymentMethodDisplay } from "@/lib/sales";

function formatInvoiceDate(value) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function addDays(value, days) {
  if (!value || days == null) return null;
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + Number(days));
  return d.toISOString();
}

const DEFAULT_INVOICE_TERMS = [
  "Order valid for the period shown above.",
  "No goods shall be received without an invoice or delivery note.",
  "Please quote invoice number on all delivery notes.",
  "Kindly attach a copy of this invoice to delivery notes.",
  "No oversupply will be accepted.",
  "Ensure KRA PIN is captured on all supplier invoices.",
  "Goods must comply with applicable KEBS standards.",
  "VAT amount will not be paid on invoices without ETR receipt.",
  "Payment terms as agreed with the customer.",
];

function formatInvoiceDateShort(value) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function metaRow(label, value, { emphasize = false } = {}) {
  const display = value == null || value === "" ? "—" : String(value);
  return `<div class="meta-row">
    <span class="meta-label">${escapeHtml(label)}</span>
    <span class="meta-value${emphasize ? " meta-value-em" : ""}">${escapeHtml(display)}</span>
  </div>`;
}

/**
 * A4 invoice receipt — org branding, standard line columns, optional KRA QR.
 */
export function buildSaleInvoiceHtml(
  sale,
  {
    seller = {},
    customer = null,
    branch = null,
    preparedBy = null,
    invoiceValidDays = 7,
    uomById = null,
    terms = null,
    branding = null,
    productDiscountsEnabled = false,
    orderDiscountEnabled = false,
    kraData = null,
    kraQrDataUrl = null,
    documentFooterText = "",
    paymentInstructions = null,
    showPaymentInstructions = true,
    deliveryTerms = null,
    footerLines = null,
  } = {},
) {
  if (!sale) return "";

  const items = sale.items ?? [];
  const invoiceNo = formatReceiptNumber(sale);
  const createdOn = sale.completed_at ?? sale.created_at;
  const validUntil = addDays(createdOn, invoiceValidDays);
  const customerName = customer?.customer_name ?? saleCustomerLabel(sale);
  const payment = salePaymentMethodDisplay(sale);
  const paymentLine = payment.isMixed
    ? `${payment.label} (${payment.methods.join(", ")})`
    : payment.label;
  const customerPhone =
    customer?.phone_number ??
    sale.customer_phone ??
    sale.customer_mobile ??
    customer?.additional_phone ??
    "";
  const customerTown = customer?.town ?? branch?.name ?? "—";
  const paymentTerms = customer?.terms_of_payment ?? paymentLine;

  const showDiscountColumn = shouldShowPrintDiscountColumn({
    allowDiscounts: productDiscountsEnabled,
  });
  const discountTotals = saleDocumentDiscountTotals({
    items,
    sale,
    orderDiscountEnabled,
  });

  const totalVat = Number(sale.total_vat ?? 0);
  const orderTotal = Number(sale.order_total ?? 0);

  const sellerName = seller.name ?? "Company";
  const sellerPhones = [seller.phone, seller.secondary_phone].filter(Boolean).join(" / ");
  const deliverAt = [branch?.name, branch?.address].filter(Boolean).join(" · ") || seller.address || "—";

  const itemRows = buildSaleDocumentLineRows(items, {
    uomById,
    showDiscountColumn,
    layout: "a4",
  });
  const tableHead = buildSaleDocumentTableHead({
    showDiscountColumn,
    layout: "a4",
  });

  const termLines = (deliveryTerms ?? terms ?? DEFAULT_INVOICE_TERMS)
    .flatMap((entry) => String(entry).split(/\n+/))
    .map((t) => t.trim())
    .filter(Boolean);

  const termsHtml = termLines
    .map((line, index) => `<li><span class="term-num">${index + 1}.</span> ${escapeHtml(line)}</li>`)
    .join("");

  const printedAt = new Date().toLocaleString("en-GB");
  const preparedByName = preparedBy ?? sale.cashier_name ?? sale.user?.full_name ?? "—";

  const orgHeader = branding
    ? buildSaleDocumentOrgHeaderHtml(branding, { layout: "a4" })
    : `<div class="brand-name">${escapeHtml(sellerName)}</div>`;

  const kraQrHtml = buildKraDocumentQrHtml(kraData, kraQrDataUrl, { size: 130, layout: "a4" });

  const paymentInstructionsHtml =
    showPaymentInstructions && paymentInstructions
      ? buildReceiptPaymentDetailsHtml(paymentInstructions, { layout: "a4" })
      : "";

  const resolvedFooterLines =
    footerLines ??
    resolveInvoiceFooterLines(null, {
      organizationName: sellerName,
      validDays: invoiceValidDays,
    });
  const footerNotesHtml = resolvedFooterLines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");

  const metaSheetHtml = [
    metaRow("Invoice No.", invoiceNo, { emphasize: true }),
    metaRow("Customer Name", customerName),
    metaRow("Phone Number", customerPhone),
    metaRow("Date", formatInvoiceDateShort(createdOn)),
    metaRow("K.R.A Pin", customer?.kra_pin ?? seller.tax_pin),
    metaRow("Terms of Payment", paymentTerms),
    metaRow("Location", customerTown !== "—" ? customerTown : deliverAt),
    metaRow("Valid Until", formatInvoiceDate(validUntil)),
    metaRow("Order #", sale.order_num ?? sale.id),
    metaRow("Deliver At", deliverAt),
  ].join("");

  const totalDiscount =
    discountTotals.lineDiscountTotal + discountTotals.orderDiscount;

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Invoice Receipt ${escapeHtml(invoiceNo)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    html { height: 100%; }
    body { font-family: "Times New Roman", Times, serif; margin: 0; padding: 16px; color: #000; font-size: 11px; line-height: 1.35; min-height: 100%; box-sizing: border-box; }
    .page { max-width: 820px; margin: 0 auto; min-height: calc(100vh - 32px); display: flex; flex-direction: column; }
    .page-body { flex: 1 0 auto; }
    .org-brand .org-logo { display: block; margin: 0 auto 8px; max-height: 72px; max-width: 280px; object-fit: contain; }
    .org-brand .org-name { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .brand-name { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .brand-meta { margin-top: 6px; font-size: 10px; text-align: center; }
    .doc-title { text-align: center; font-size: 14px; font-weight: 700; margin: 10px 0 12px; letter-spacing: 0.08em; text-transform: uppercase; }
    .meta-sheet { margin-bottom: 12px; font-size: 10px; }
    .meta-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin: 3px 0; }
    .meta-label { font-weight: 700; text-transform: uppercase; white-space: nowrap; }
    .meta-value { text-align: right; flex: 1; min-width: 0; word-break: break-word; }
    .meta-value-em { font-style: italic; font-weight: 700; }
    table.items { width: 100%; border-collapse: collapse; margin: 8px 0 10px; font-size: 10px; }
    table.items th, table.items td { border-top: 1px dotted #000; border-bottom: 1px dotted #000; padding: 5px 6px; vertical-align: top; }
    table.items th { font-weight: 700; text-align: left; text-transform: uppercase; font-size: 9px; }
    table.items td.num, table.items th.num { text-align: right; white-space: nowrap; }
    .totals { display: flex; justify-content: flex-end; margin: 6px 0 14px; }
    .totals-box { min-width: 280px; text-align: right; font-size: 11px; }
    .totals-box p { margin: 3px 0; }
    .totals-box .grand { font-weight: 700; font-size: 12px; margin-top: 6px; padding-top: 4px; border-top: 1px solid #000; }
    .served-by { margin: 10px 0 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .receive-signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin: 12px 0 8px; font-size: 10px; }
    .receive-signatures p { margin: 0; }
    .goods-note { margin: 8px 0 10px; font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .bottom-grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 20px; margin-top: 8px; }
    .terms { margin: 0; padding-left: 0; list-style: none; font-size: 9px; }
    .terms li { margin-bottom: 3px; }
    .term-num { font-weight: 700; margin-right: 4px; }
    .signatures p { margin: 0 0 18px; font-size: 10px; text-align: right; }
    .sig-line { display: inline-block; min-width: 160px; border-bottom: 1px dotted #000; padding-bottom: 2px; }
    .footer-notes { margin-top: 12px; text-align: center; font-size: 9px; }
    .footer-notes p { margin: 4px 0; }
    .print-footer {
      margin-top: auto;
      padding-top: 10px;
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-size: 9px;
      color: #333;
      border-top: 1px dotted #999;
      flex-shrink: 0;
    }
    .pay-instructions { margin: 10px 0 12px; padding: 8px 10px; border: 1px dotted #000; font-size: 10px; }
    .pay-instructions .pay-title { font-weight: 700; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
    .pay-instructions .pay-line { display: flex; justify-content: space-between; gap: 12px; margin: 2px 0; }
    .pay-instructions .pay-label { font-weight: 700; }
    .pay-instructions .pay-value { text-align: right; }
    .pay-instructions .pay-note { margin-top: 6px; font-size: 9px; color: #333; }
    .center { text-align: center; }
    @media print {
      body { padding: 0; }
      .page { min-height: calc(297mm - 24mm); }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-body">
    <div class="brand">
      ${orgHeader}
      <div class="brand-meta">
        ${seller.address ? `<div>${escapeHtml(seller.address)}</div>` : ""}
        ${seller.email ? `<div>Email: ${escapeHtml(seller.email)}</div>` : ""}
        ${sellerPhones ? `<div>Tel: ${escapeHtml(sellerPhones)}</div>` : ""}
        ${seller.tax_pin ? `<div>PIN NO: ${escapeHtml(seller.tax_pin)}</div>` : ""}
        ${seller.vat_regno ? `<div>VAT Reg: ${escapeHtml(seller.vat_regno)}</div>` : ""}
      </div>
    </div>

    <div class="doc-title">Invoice Receipt</div>

    <div class="meta-sheet">
      ${metaSheetHtml}
    </div>

    <table class="items">
      <thead>${tableHead}</thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <p><strong>Total Amount:</strong> ${escapeHtml(formatPrintAmount(orderTotal))}</p>
        ${totalDiscount > 0.0001 ? `<p><strong>Total Discount:</strong> ${escapeHtml(formatPrintAmount(totalDiscount))}</p>` : ""}
        <p><strong>V.A.T Charged:</strong> ${escapeHtml(formatPrintAmount(totalVat))}</p>
        <p class="grand"><strong>Grand Total:</strong> ${escapeHtml(formatPrintAmount(orderTotal))}</p>
        <p><strong>Payment:</strong> ${escapeHtml(paymentLine)}</p>
      </div>
    </div>

    ${paymentInstructionsHtml}

    <div class="served-by">You were served by: ${escapeHtml(preparedByName)}</div>
    <div class="receive-signatures">
      <p>Received By: <span class="sig-line">&nbsp;</span></p>
      <p>Signature: <span class="sig-line">&nbsp;</span></p>
    </div>
    <p class="goods-note center">Please confirm your goods (Goods once sold are not refundable)</p>

    <div class="bottom-grid">
      <div>
        <p class="meta-label">Delivery Instructions:</p>
        <ol class="terms">${termsHtml}</ol>
      </div>
      <div class="signatures">
        <p>Prepared By: <span class="sig-line">${escapeHtml(preparedByName)}</span></p>
        <p>Checked By: <span class="sig-line">&nbsp;</span></p>
        <p>Authorised By: <span class="sig-line">&nbsp;</span></p>
        <p>Terms: <span class="sig-line">${escapeHtml(paymentTerms)}</span></p>
      </div>
    </div>

    <div class="footer-notes">
      ${kraQrHtml}
      ${footerNotesHtml}
      ${documentFooterText ? `<p>${escapeHtml(documentFooterText)}</p>` : ""}
    </div>
    </div>

    <div class="print-footer">
      <span>Printed On: ${escapeHtml(printedAt)}</span>
      <span>By: ${escapeHtml(preparedByName)}</span>
      <span>Page 1 of 1</span>
    </div>
  </div>
</body>
</html>`;

  return html;
}

export function printSaleInvoice(sale, options = {}) {
  const html = buildSaleInvoiceHtml(sale, options);
  if (!html) return;
  if (options.printWindow) {
    fillPrintWindow(options.printWindow, html);
    return;
  }
  openPrintWindow(html, "width=860,height=960");
}
