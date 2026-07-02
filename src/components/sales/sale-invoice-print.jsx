import { buildKraDocumentQrHtml } from "@/lib/kra-receipt-qr";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import { openPrintWindow, fillPrintWindow } from "@/lib/open-print-window";
import {
  buildSaleDocumentLineRows,
  buildSaleDocumentOrgHeaderHtml,
  buildSaleDocumentTableHead,
  escapeHtml,
  formatPrintAmount,
  resolveSaleDocumentStoreContact,
  resolveSaleOrderCreatorName,
  saleDocumentDiscountTotals,
  shouldShowPrintDiscountColumn,
} from "@/lib/sale-document-print-shared";
import { buildReceiptPaymentDetailsHtml } from "@/lib/receipt-payment-details";
import {
  buildDocumentPrintEdgeFooterHtml,
  documentPrintEdgeFooterStyles,
} from "@/lib/document-print-edge-footer";
import {
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
  orgPrintPx,
} from "@/lib/print-typography";
import { formatOrderNumber, saleCustomerLabel, salePaymentMethodDisplay } from "@/lib/sales";
import { isLegacySale } from "@/lib/sale-line-items";

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
    printedBy = null,
    invoiceValidDays = 7,
    uomById = null,
    branding = null,
    productDiscountsEnabled = false,
    orderDiscountEnabled = false,
    kraData = null,
    kraQrDataUrl = null,
    documentFooterText = "",
    paymentInstructions = null,
    showPaymentInstructions = true,
    showBranchOnReceipt = true,
    generalSettings = null,
  } = {},
) {
  if (!sale) return "";

  const px = (base, print = false) =>
    orgPrintPx(base, generalSettings, { variant: "sale_invoice", print });
  const font = orgPrintFontFamilyFromSettings(generalSettings, "sale_invoice");

  const items = sale.items ?? [];
  const invoiceNo = formatOrderNumber(sale);
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
  const { branchName, storeAddress, storePhones } = resolveSaleDocumentStoreContact({
    showBranchOnReceipt,
    branch,
    seller,
  });
  const customerTown = customer?.town ?? (showBranchOnReceipt ? branchName : null) ?? "—";
  const deliverAt =
    showBranchOnReceipt && branchName
      ? [branchName, storeAddress].filter(Boolean).join(" · ") || "—"
      : storeAddress || "—";
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

  const itemRows = buildSaleDocumentLineRows(items, {
    uomById,
    showDiscountColumn,
    layout: "a4",
    legacyPrint: isLegacySale(sale),
  });
  const tableHead = buildSaleDocumentTableHead({
    showDiscountColumn,
    layout: "a4",
  });

  const printedAt = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const servedByName = resolveSaleOrderCreatorName(sale, preparedBy);
  const printedByName = resolvePrintedByUser(printedBy) ?? "—";

  const orgHeader = buildSaleDocumentOrgHeaderHtml(branding, {
    layout: "a4",
    fallbackName: sellerName,
  });

  const kraQrHtml = buildKraDocumentQrHtml(kraData, kraQrDataUrl, { size: 130, layout: "a4" });

  const paymentInstructionsHtml =
    showPaymentInstructions && paymentInstructions
      ? buildReceiptPaymentDetailsHtml(paymentInstructions, { layout: "a4" })
      : "";

  const metaSheetHtml = [
    metaRow("Invoice No.", invoiceNo, { emphasize: true }),
    metaRow("Customer Name", customerName),
    metaRow("Phone Number", customerPhone),
    metaRow("Date", formatInvoiceDateShort(createdOn)),
    metaRow("K.R.A Pin", customer?.kra_pin ?? seller.tax_pin),
    metaRow("Terms of Payment", paymentTerms),
    metaRow("Location", customerTown !== "—" ? customerTown : deliverAt),
    metaRow("Valid Until", formatInvoiceDate(validUntil)),
    metaRow("Deliver At", deliverAt),
  ].join("");

  const totalDiscount =
    discountTotals.lineDiscountTotal + discountTotals.orderDiscount;

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Invoice Receipt ${escapeHtml(invoiceNo)}</title>
  <style>
    @page { size: A4; margin: 0; }
    html { height: 100%; }
    body { font-family: ${font}; margin: 0; padding: 16px; font-size: ${px(12)}; line-height: 1.4; min-height: 100%; box-sizing: border-box; ${orgPrintInkStyles(generalSettings, "sale_invoice")} }
    .page { max-width: 820px; margin: 0 auto; }
    .page-body { }
    .org-brand .org-logo { display: block; margin: 0 auto 8px; max-height: 80px; max-width: 300px; object-fit: contain; }
    .org-brand .org-name { font-size: ${px(24)}; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .brand-name { text-align: center; font-size: ${px(24)}; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .brand-meta { margin-top: 6px; font-size: ${px(11)}; text-align: center; font-weight: var(--print-w-body, 600); }
    .doc-title { text-align: center; font-size: ${px(15)}; font-weight: 700; margin: 10px 0 12px; letter-spacing: 0.08em; text-transform: uppercase; }
    .meta-sheet { margin-bottom: 12px; font-size: ${px(11)}; }
    .meta-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; margin: 4px 0; }
    .meta-label { font-weight: 700; text-transform: uppercase; white-space: nowrap; }
    .meta-value { text-align: right; flex: 1; min-width: 0; word-break: break-word; font-weight: 600; }
    .meta-value-em { font-style: italic; font-weight: 700; }
    table.items { width: 100%; border-collapse: collapse; margin: 8px 0 10px; font-size: ${px(11)}; }
    table.items th, table.items td { border-top: 1px dotted #000; border-bottom: 1px dotted #000; padding: 5px 6px; vertical-align: top; }
    table.items th { font-weight: 700; text-align: left; text-transform: uppercase; font-size: ${px(10)}; }
    table.items td.num, table.items th.num { text-align: right; white-space: nowrap; }
    .totals { display: flex; justify-content: flex-end; margin: 6px 0 14px; }
    .totals-box { min-width: 280px; text-align: right; font-size: ${px(12)}; font-weight: 600; }
    .totals-box p { margin: 3px 0; }
    .totals-box .grand { font-weight: 700; font-size: ${px(13)}; margin-top: 6px; padding-top: 4px; border-top: 1px solid #000; }
    .served-by { margin: 10px 0 8px; font-size: ${px(11)}; font-weight: 700; text-transform: uppercase; }
    .goods-note { margin: 8px 0 4px; font-size: ${px(11)}; font-weight: 700; text-transform: uppercase; }
    .goods-note-sub { margin: 0 0 0; font-weight: 700; }
    .receive-signatures { margin: 14px 0 0; font-size: ${px(11)}; max-width: 420px; }
    .sig-row { display: flex; align-items: baseline; gap: 6px; margin: 0 0 10px; }
    .sig-row:last-child { margin-bottom: 0; }
    .sig-label { white-space: nowrap; min-width: 5.5rem; font-weight: 700; }
    .sig-line { flex: 1; border-bottom: 1px dotted #000; min-height: 1.1em; }
    .footer-notes { margin: 0 0 8px; text-align: center; font-size: ${px(10)}; font-weight: 600; }
    .footer-notes p { margin: 4px 0; }
    .pay-instructions { margin: 10px 0 12px; padding: 8px 10px; border: 1px dotted #000; font-size: ${px(11)}; font-weight: 600; }
    .pay-instructions .pay-title { font-weight: 700; margin: 0 0 6px; text-transform: uppercase; letter-spacing: 0.04em; }
    .pay-instructions .pay-line { display: flex; justify-content: space-between; gap: 12px; margin: 2px 0; }
    .pay-instructions .pay-label { font-weight: 700; }
    .pay-instructions .pay-value { text-align: right; font-weight: 600; }
    .pay-instructions .pay-note { margin-top: 6px; font-size: ${px(10)}; font-weight: 600; }
    .center { text-align: center; }
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "sale_invoice" })}
    @media print {
      body { font-size: ${px(12, true)}; }
      .org-brand .org-name, .brand-name { font-size: ${px(24, true)}; }
      .brand-meta { font-size: ${px(11, true)}; }
      .doc-title { font-size: ${px(15, true)}; }
      .meta-sheet { font-size: ${px(11, true)}; }
      table.items { font-size: ${px(11, true)}; }
      table.items th { font-size: ${px(10, true)}; }
      .totals-box { font-size: ${px(12, true)}; }
      .totals-box .grand { font-size: ${px(13, true)}; }
      .served-by, .goods-note, .receive-signatures { font-size: ${px(11, true)}; }
      .footer-notes { font-size: ${px(10, true)}; }
      .pay-instructions { font-size: ${px(11, true)}; }
      .pay-instructions .pay-note { font-size: ${px(10, true)}; }
      .page { max-width: none; margin: 0; }
    }
  </style>
</head>
<body class="has-doc-print-edge-footer">
  <div class="page">
    <div class="page-body">
    <div class="brand">
      ${orgHeader}
      <div class="brand-meta">
        ${branchName ? `<div>${escapeHtml(branchName)}</div>` : ""}
        ${storeAddress ? `<div>${escapeHtml(storeAddress)}</div>` : ""}
        ${seller.email ? `<div>Email: ${escapeHtml(seller.email)}</div>` : ""}
        ${storePhones ? `<div>Tel: ${escapeHtml(storePhones)}</div>` : ""}
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

    <div class="served-by">You were served by: ${escapeHtml(servedByName)}</div>
    <p class="goods-note center">Please Confirm Your Goods</p>
    <p class="goods-note goods-note-sub center">(Goods once sold are not refundable)</p>
    <div class="receive-signatures">
      <p class="sig-row"><span class="sig-label">Received By:</span><span class="sig-line">&nbsp;</span></p>
      <p class="sig-row"><span class="sig-label">Signature:</span><span class="sig-line">&nbsp;</span></p>
    </div>

    ${
      kraQrHtml
        ? `<div class="footer-notes">${kraQrHtml}</div>`
        : ""
    }
    </div>
  </div>
  ${buildDocumentPrintEdgeFooterHtml({
    printedBy: printedByName,
    printedAt,
    documentFooterText,
  })}
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
