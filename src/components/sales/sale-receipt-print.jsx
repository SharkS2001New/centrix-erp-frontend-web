import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
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
  buildReceiptPaymentDetailsHtml,
} from "@/lib/receipt-payment-details";
import { formatReceiptNumber, formatSaleKes, saleCustomerLabel } from "@/lib/sales";

export function buildSaleReceiptHtml(
  sale,
  {
    organizationName = DEFAULT_PRINT_ORG_NAME,
    uomById = null,
    seller = null,
    branch = null,
    customer = null,
    productDiscountsEnabled = true,
    orderDiscountEnabled = false,
    customerNameEnabled = true,
    showBranchOnReceipt = true,
    branding = null,
    kraEnabled = false,
    kraData = null,
    kraQrDataUrl = null,
    documentFooterText = "",
    paymentInstructions = null,
    showPaymentInstructions = true,
  } = {},
) {
  if (!sale) return "";

  const items = sale.items ?? [];
  const receipt = formatReceiptNumber(sale);
  const customerName = customer?.customer_name ?? saleCustomerLabel(sale);
  const customerPhone =
    sale.customer_phone ?? sale.customer_mobile ?? customer?.phone_number ?? customer?.additional_phone ?? "";
  const rawDate = sale.completed_at ?? sale.created_at;
  const date = rawDate
    ? new Date(rawDate).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "—";
  const time = rawDate
    ? new Date(rawDate).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      })
    : "—";

  const orgName = seller?.name ?? organizationName;
  const branchName = showBranchOnReceipt && branch?.name ? branch.name : null;
  const storeAddress =
    showBranchOnReceipt && branch?.address ? branch.address : (seller?.address ?? "");
  const storePhones =
    showBranchOnReceipt && branch?.phone
      ? String(branch.phone)
      : [seller?.phone, seller?.secondary_phone].filter(Boolean).join(" / ");
  const tillNo = sale.pos_terminal_id ?? sale.branch_id ?? branch?.id ?? "1";
  const orderNo = sale.order_num ?? sale.id ?? "—";

  const showDiscountColumn = shouldShowPrintDiscountColumn({
    allowDiscounts: productDiscountsEnabled,
  });
  const discountTotals = saleDocumentDiscountTotals({
    items,
    sale,
    orderDiscountEnabled,
  });

  const vatAmount = Number(sale.total_vat ?? 0);
  const orderTotal = Number(sale.order_total ?? 0);
  const cashAmount = Number(sale.cash ?? 0);
  const mpesaAmount = Number(sale.mpesa_amount ?? 0);
  const equityAmount = Number(sale.equity_amount ?? 0);
  const kcbAmount = Number(sale.kcb_amount ?? 0);

  const paymentLines = [
    { label: "Cash amount", value: cashAmount },
    { label: "M-Pesa amount", value: mpesaAmount },
  ];
  if (kcbAmount > 0) {
    paymentLines.push({ label: "Bank amount (KCB)", value: kcbAmount });
  }
  if (equityAmount > 0) {
    paymentLines.push({ label: "Bank amount (Equity)", value: equityAmount });
  }

  const itemRows = buildSaleDocumentLineRows(items, {
    uomById,
    showDiscountColumn,
    layout: "thermal",
  });
  const tableHead = buildSaleDocumentTableHead({
    showDiscountColumn,
    layout: "thermal",
  });

  const paymentRows = paymentLines
    .map(
      (entry) =>
        `<div class="payment-row"><span>${escapeHtml(entry.label)}</span><span>${escapeHtml(formatSaleKes(entry.value))}</span></div>`,
    )
    .join("");

  const totalPaid = cashAmount + mpesaAmount + equityAmount + kcbAmount;
  const changeAmount = Math.max(0, totalPaid - orderTotal);
  const totalItems = items.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0);

  const orgHeader = branding
    ? buildSaleDocumentOrgHeaderHtml(branding, { layout: "thermal" })
    : `<div class="company-name">${escapeHtml(orgName)}</div>`;

  const kraBlock =
    kraEnabled && kraData
      ? buildKraFiscalBlockHtml(kraData, { layout: "thermal", qrDataUrl: kraQrDataUrl })
      : "";

  const paymentInstructionsHtml =
    showPaymentInstructions && paymentInstructions
      ? buildReceiptPaymentDetailsHtml(paymentInstructions, { layout: "thermal" })
      : "";

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Receipt ${escapeHtml(receipt)}</title>
  <style>
    body { font-family: ui-monospace, "Courier New", monospace; margin: 0; padding: 12px; color: #111827; background: #fff; font-size: 10px; }
    .receipt { width: 320px; margin: 0 auto; }
    .company-name { text-align: center; font-size: 14px; font-weight: 700; letter-spacing: .04em; margin-bottom: 4px; text-transform: uppercase; }
    .company-meta { text-align: center; font-size: 9px; color: #334155; line-height: 1.45; }
    .doc-title { text-align: center; font-size: 11px; font-weight: 700; letter-spacing: .12em; margin: 10px 0 8px; }
    .divider { border-top: 1px dashed #64748b; margin: 8px 0; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 8px; font-size: 9px; line-height: 1.4; }
    .meta-label { font-weight: 700; }
    .meta-value { text-align: right; }
    .meta-full { grid-column: 1 / -1; }
    .table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9px; }
    .table thead th { padding: 4px 0; border-bottom: 1px solid #111827; font-weight: 700; text-align: left; }
    .table thead th.qty { text-align: center; }
    .table thead th.price,
    .table thead th.disc,
    .table thead th.amount { text-align: right; }
    .table tbody tr { border-top: 1px dashed #cbd5e1; }
    .table td { padding: 4px 0; vertical-align: top; }
    .table td.desc { padding-right: 6px; }
    .table td.qty { width: 2.4rem; text-align: center; white-space: nowrap; }
    .table td.price,
    .table td.disc,
    .table td.amount { text-align: right; white-space: nowrap; }
    .totals { margin-top: 6px; font-size: 9px; }
    .totals-row { display: flex; justify-content: space-between; margin: 3px 0; }
    .totals-row.grand { font-size: 11px; font-weight: 700; margin-top: 6px; padding-top: 4px; border-top: 1px solid #111827; }
    .payment-title { text-align: center; font-weight: 700; letter-spacing: .08em; margin: 8px 0 4px; font-size: 9px; }
    .payment-row { display: flex; justify-content: space-between; margin: 2px 0; font-size: 9px; }
    .pay-instructions { margin: 8px 0; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 9px; }
    .pay-instructions .payment-title { margin-top: 0; }
    .pay-line { display: flex; justify-content: space-between; gap: 8px; margin: 2px 0; }
    .pay-label { font-weight: 700; }
    .pay-value { text-align: right; }
    .pay-note { margin-top: 4px; text-align: center; color: #475569; font-size: 8px; line-height: 1.35; }
    .change { text-align: center; font-weight: 700; margin-top: 6px; font-size: 10px; }
    .thanks { text-align: center; margin: 10px 0 2px; font-size: 9px; color: #334155; text-transform: uppercase; letter-spacing: .04em; }
    .footer-text { text-align: center; font-size: 8px; color: #64748b; margin-top: 4px; }
    .receipt-code { text-align: center; margin-top: 8px; font-size: 9px; letter-spacing: .12em; }
    .center { text-align: center; }
    .muted { color: #64748b; }
    @media print { body { padding: 0; } .receipt { margin: 0 auto; } }
  </style>
</head>
<body>
  <div class="receipt">
    ${orgHeader}
    ${branchName ? `<div class="company-meta">${escapeHtml(branchName)}</div>` : ""}
    ${storeAddress ? `<div class="company-meta">${escapeHtml(storeAddress)}</div>` : ""}
    ${storePhones ? `<div class="company-meta">TEL: ${escapeHtml(storePhones)}</div>` : ""}
    ${seller?.tax_pin ? `<div class="company-meta">PIN: ${escapeHtml(seller.tax_pin)}</div>` : ""}
    <div class="doc-title">Sales Receipt</div>
    <div class="divider"></div>
    <div class="meta-grid">
      <div><span class="meta-label">Receipt No:</span> ${escapeHtml(receipt)}</div>
      <div class="meta-value"><span class="meta-label">Order No:</span> ${escapeHtml(String(orderNo))}</div>
      <div><span class="meta-label">Date:</span> ${escapeHtml(date)}</div>
      <div class="meta-value"><span class="meta-label">Time:</span> ${escapeHtml(time)}</div>
      <div><span class="meta-label">Till No:</span> ${escapeHtml(String(tillNo))}</div>
      ${customerNameEnabled ? `<div class="meta-value"><span class="meta-label">Cashier:</span> ${escapeHtml(sale.cashier_name ?? sale.user?.full_name ?? "—")}</div>` : ""}
      ${customerNameEnabled ? `<div class="meta-full"><span class="meta-label">Customer:</span> ${escapeHtml(customerName)}</div>` : ""}
      ${customerPhone ? `<div class="meta-full"><span class="meta-label">Phone:</span> ${escapeHtml(customerPhone)}</div>` : ""}
    </div>
    <div class="divider"></div>
    <table class="table">
      <thead>${tableHead}</thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="totals">
      <div class="totals-row"><span>Total items</span><span>${escapeHtml(String(Math.round(totalItems)))}</span></div>
      <div class="totals-row"><span>Sub total</span><span>${escapeHtml(formatPrintAmount(discountTotals.subtotalBeforeDiscount))}</span></div>
      ${discountTotals.showDiscountSection ? `<div class="totals-row"><span>Discount</span><span>−${escapeHtml(formatPrintAmount(discountTotals.lineDiscountTotal + discountTotals.orderDiscount))}</span></div>` : ""}
      ${discountTotals.showOrderDiscountRow ? `<div class="totals-row"><span>Subtotal after discount</span><span>${escapeHtml(formatPrintAmount(discountTotals.subtotalAfterAllDiscounts))}</span></div>` : ""}
      <div class="totals-row"><span>VAT</span><span>${escapeHtml(formatPrintAmount(vatAmount))}</span></div>
      <div class="totals-row grand"><span>Total amount</span><span>${escapeHtml(formatSaleKes(orderTotal))}</span></div>
    </div>
    <div class="payment-title">Amount paid</div>
    ${paymentRows}
    <div class="change">Change: ${escapeHtml(formatSaleKes(changeAmount))}</div>
    ${paymentInstructionsHtml}
    ${kraBlock}
    <div class="thanks">Thank you for shopping with us!</div>
    <div class="thanks">Goods once sold are not refundable</div>
    ${documentFooterText ? `<div class="footer-text">${escapeHtml(documentFooterText)}</div>` : ""}
    <div class="receipt-code">${escapeHtml(receipt)}</div>
  </div>
</body>
</html>`;

  return html;
}

export function printSaleReceipt(sale, options = {}) {
  const html = buildSaleReceiptHtml(sale, options);
  if (!html) return;
  openPrintWindow(html, "width=420,height=720");
}
