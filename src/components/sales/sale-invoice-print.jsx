import { buildKraFiscalBlockHtml } from "@/lib/kra-receipt-qr";
import { openPrintWindow } from "@/lib/open-print-window";
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

/**
 * A4 tax invoice — org branding, standard line columns, optional KRA QR.
 */
export function printSaleInvoice(
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
    kraEnabled = false,
    kraData = null,
    kraQrDataUrl = null,
    documentFooterText = "",
    paymentInstructions = null,
    showPaymentInstructions = true,
    deliveryTerms = null,
    footerLines = null,
  } = {},
) {
  if (!sale) return;

  const items = sale.items ?? [];
  const invoiceNo = formatReceiptNumber(sale);
  const createdOn = sale.completed_at ?? sale.created_at;
  const validUntil = addDays(createdOn, invoiceValidDays);
  const customerName = customer?.customer_name ?? saleCustomerLabel(sale);
  const payment = salePaymentMethodDisplay(sale);
  const paymentLine = payment.isMixed
    ? `${payment.label} (${payment.methods.join(", ")})`
    : payment.label;

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

  const kraBlock =
    kraEnabled && kraData
      ? `<div style="margin:12px 0;">${buildKraFiscalBlockHtml(kraData, { layout: "a4", qrDataUrl: kraQrDataUrl })}</div>`
      : "";

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

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Invoice ${escapeHtml(invoiceNo)}</title>
  <style>
    @page { size: A4; margin: 12mm; }
    body { font-family: "Times New Roman", Times, serif; margin: 0; padding: 16px; color: #000; font-size: 11px; line-height: 1.35; }
    .page { max-width: 820px; margin: 0 auto; }
    .org-brand .org-logo { display: block; margin: 0 auto 8px; max-height: 72px; max-width: 280px; object-fit: contain; }
    .org-brand .org-name { font-size: 22px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .brand-name { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .brand-meta { margin-top: 6px; font-size: 10px; text-align: center; }
    .doc-title { text-align: center; font-size: 14px; font-weight: 700; margin: 10px 0 12px; letter-spacing: 0.06em; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 12px; }
    .meta-grid p { margin: 2px 0; }
    .customer-name { font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
    .meta-label { font-weight: 700; }
    .meta-value em { font-style: italic; }
    table.items { width: 100%; border-collapse: collapse; margin: 8px 0 10px; font-size: 10px; }
    table.items th, table.items td { border-top: 1px dotted #000; border-bottom: 1px dotted #000; padding: 5px 6px; vertical-align: top; }
    table.items th { font-weight: 700; text-align: left; }
    table.items td.num, table.items th.num { text-align: right; white-space: nowrap; }
    .totals { display: flex; justify-content: flex-end; margin: 6px 0 14px; }
    .totals-box { min-width: 240px; text-align: right; font-size: 11px; }
    .totals-box p { margin: 3px 0; }
    .totals-box .grand { font-weight: 700; font-size: 12px; margin-top: 6px; padding-top: 4px; border-top: 1px solid #000; }
    .bottom-grid { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 20px; margin-top: 8px; }
    .terms { margin: 0; padding-left: 0; list-style: none; font-size: 9px; }
    .terms li { margin-bottom: 3px; }
    .term-num { font-weight: 700; margin-right: 4px; }
    .signatures p { margin: 0 0 18px; font-size: 10px; }
    .sig-line { display: inline-block; min-width: 160px; border-bottom: 1px dotted #000; padding-bottom: 2px; }
    .footer-notes { margin-top: 12px; text-align: center; font-size: 9px; }
    .footer-notes p { margin: 4px 0; }
    .footer-notes .warn { font-weight: 700; text-decoration: underline; text-transform: uppercase; }
    .print-footer { margin-top: 14px; display: flex; justify-content: space-between; font-size: 9px; color: #333; border-top: 1px dotted #999; padding-top: 6px; }
    .pay-instructions { margin: 10px 0 12px; padding: 8px 10px; border: 1px dotted #000; font-size: 10px; }
    .pay-instructions .pay-title { font-weight: 700; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
    .pay-instructions .pay-line { display: flex; justify-content: space-between; gap: 12px; margin: 2px 0; }
    .pay-instructions .pay-label { font-weight: 700; }
    .pay-instructions .pay-value { text-align: right; }
    .pay-instructions .pay-note { margin-top: 6px; font-size: 9px; color: #333; }
    .center { text-align: center; }
    .muted { color: #666; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="page">
    <div class="brand">
      ${orgHeader}
      <div class="brand-meta">
        ${!branding ? "" : ""}
        ${seller.address ? `<div>${escapeHtml(seller.address)}</div>` : ""}
        ${seller.email ? `<div>Email: ${escapeHtml(seller.email)}</div>` : ""}
        ${sellerPhones ? `<div>Tel: ${escapeHtml(sellerPhones)}</div>` : ""}
        ${seller.tax_pin ? `<div>PIN NO: ${escapeHtml(seller.tax_pin)}</div>` : ""}
        ${seller.vat_regno ? `<div>VAT Reg: ${escapeHtml(seller.vat_regno)}</div>` : ""}
      </div>
    </div>

    <div class="doc-title">TAX INVOICE</div>

    <div class="meta-grid">
      <div>
        <div class="customer-name">${escapeHtml(customerName)}</div>
        ${customer?.po_box ? `<p>P.O Box: ${escapeHtml(customer.po_box)}</p>` : ""}
        ${customer?.email ? `<p>Email Address: ${escapeHtml(customer.email)}</p>` : ""}
        ${customer?.phone_number ? `<p>Phone: ${escapeHtml(customer.phone_number)}</p>` : ""}
        ${customer?.additional_phone ? `<p>Alt. phone: ${escapeHtml(customer.additional_phone)}</p>` : ""}
        <p>K.R.A Pin: ${escapeHtml(customer?.kra_pin ?? "—")}</p>
        <p>Town: ${escapeHtml(customer?.town ?? "—")}</p>
        <p>Terms of Payment: ${escapeHtml(customer?.terms_of_payment ?? paymentLine)}</p>
      </div>
      <div>
        <p><span class="meta-label">Invoice No.:</span> <span class="meta-value"><em>${escapeHtml(invoiceNo)}</em></span></p>
        <p><span class="meta-label">Created On:</span> ${escapeHtml(formatInvoiceDate(createdOn))}</p>
        <p><span class="meta-label">Valid Until:</span> ${escapeHtml(formatInvoiceDate(validUntil))}</p>
        <p><span class="meta-label">Deliver At:</span> ${escapeHtml(deliverAt)}</p>
        <p><span class="meta-label">Order #:</span> ${escapeHtml(String(sale.order_num ?? sale.id))}</p>
      </div>
    </div>

    <table class="items">
      <thead>${tableHead}</thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div class="totals">
      <div class="totals-box">
        <p><strong>Subtotal:</strong> ${escapeHtml(formatPrintAmount(discountTotals.subtotalBeforeDiscount))}</p>
        ${discountTotals.showDiscountSection ? `<p><strong>Discount:</strong> − ${escapeHtml(formatPrintAmount(discountTotals.lineDiscountTotal + discountTotals.orderDiscount))}</p>` : ""}
        ${discountTotals.showOrderDiscountRow ? `<p><strong>Subtotal after discount:</strong> ${escapeHtml(formatPrintAmount(discountTotals.subtotalAfterAllDiscounts))}</p>` : ""}
        <p><strong>Total V.A.T:</strong> ${escapeHtml(formatPrintAmount(totalVat))}</p>
        <p class="grand"><strong>Grand Total:</strong> ${escapeHtml(formatPrintAmount(orderTotal))}</p>
        <p><strong>Payment:</strong> ${escapeHtml(paymentLine)}</p>
      </div>
    </div>

    ${paymentInstructionsHtml}

    ${kraBlock}

    <div class="bottom-grid">
      <div>
        <p class="meta-label">Delivery Instructions:</p>
        <ol class="terms">${termsHtml}</ol>
      </div>
      <div class="signatures">
        <p>Prepared By: <span class="sig-line">${escapeHtml(preparedByName)}</span></p>
        <p>Checked By: <span class="sig-line">&nbsp;</span></p>
        <p>Authorised By: <span class="sig-line">&nbsp;</span></p>
        <p>Terms: <span class="sig-line">${escapeHtml(customer?.terms_of_payment ?? "—")}</span></p>
      </div>
    </div>

    <div class="footer-notes">
      ${footerNotesHtml}
      ${documentFooterText ? `<p>${escapeHtml(documentFooterText)}</p>` : ""}
    </div>

    <div class="print-footer">
      <span>Printed On: ${escapeHtml(printedAt)}</span>
      <span>By: ${escapeHtml(preparedByName)}</span>
      <span>Page 1 of 1</span>
    </div>
  </div>
</body>
</html>`;

  openPrintWindow(html, "width=860,height=960");
}
