import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { buildKraThermalQrHtml } from "@/lib/kra-receipt-qr";
import { openPrintWindow, fillPrintWindow } from "@/lib/open-print-window";
import { isPoweredByFooterLine, resolveReceiptFooterLines } from "@/lib/print-footer-settings";
import {
  buildSaleDocumentLineRows,
  buildSaleDocumentOrgHeaderHtml,
  buildSaleDocumentTableHead,
  escapeHtml,
  formatPrintAmount,
  saleDocumentDiscountTotals,
  shouldShowPrintDiscountColumn,
} from "@/lib/sale-document-print-shared";
import { buildReceiptPaymentDetailsHtml } from "@/lib/receipt-payment-details";
import { formatReceiptNumber, saleCustomerLabel } from "@/lib/sales";

function buildUsedPaymentRows(sale, orderTotal) {
  const rows = [];
  const cashAmount = Number(sale.cash ?? 0);
  const mpesaAmount = Number(sale.mpesa_amount ?? 0);
  const equityAmount = Number(sale.equity_amount ?? 0);
  const kcbAmount = Number(sale.kcb_amount ?? 0);
  const voucherAmount = Number(sale.voucher_payment_amount ?? 0);
  const pointsAmount = Number(sale.points_payment_amount ?? 0);

  if (cashAmount > 0) rows.push({ label: "Cash", value: cashAmount });
  if (mpesaAmount > 0) rows.push({ label: "M-Pesa", value: mpesaAmount });
  if (kcbAmount > 0) rows.push({ label: "KCB", value: kcbAmount });
  if (equityAmount > 0) rows.push({ label: "Equity", value: equityAmount });
  if (voucherAmount > 0) rows.push({ label: "Voucher", value: voucherAmount });
  if (pointsAmount > 0) rows.push({ label: "Points", value: pointsAmount });

  if (sale.is_credit_sale) {
    const paid = cashAmount + mpesaAmount + equityAmount + kcbAmount + voucherAmount + pointsAmount;
    const creditAmount = Math.max(0, orderTotal - paid);
    if (creditAmount > 0) rows.push({ label: "Credit", value: creditAmount });
  }

  if (!rows.length && sale.payment_method_code) {
    const code = String(sale.payment_method_code).toUpperCase();
    let label = sale.payment_method_code;
    if (code.includes("CASH")) label = "Cash";
    else if (code.includes("MPESA")) label = "M-Pesa";
    else if (code.includes("EQUITY")) label = "Equity";
    else if (code.includes("KCB")) label = "KCB";
    else if (code.includes("CREDIT")) label = "Credit";
    rows.push({ label, value: orderTotal });
  }

  return rows;
}

function formatReceiptDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function paymentDetailRow(label, value, { plain = false } = {}) {
  const display = plain ? String(value ?? "—") : formatPrintAmount(value);
  return `<div class="amount-line"><span class="amount-label">${escapeHtml(label)}</span><span class="amount-value">${escapeHtml(display)}</span></div>`;
}

function totalsLineRow(label, value, { grand = false } = {}) {
  return `<div class="amount-line${grand ? " amount-line-grand" : ""}"><span class="amount-label">${escapeHtml(label)}</span><span class="amount-value">${escapeHtml(value)}</span></div>`;
}

function buildReceiptFooterHtml(documentFooterText, organizationName) {
  const lines = resolveReceiptFooterLines(
    documentFooterText ? { print_footer_receipt: documentFooterText } : {},
    organizationName,
  );
  return lines
    .map((line) => {
      const poweredBy = isPoweredByFooterLine(line);
      const className = poweredBy ? "footer-powered-by" : "footer-text";
      return `<div class="${className}">${escapeHtml(line)}</div>`;
    })
    .join("");
}

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
  const dateTime = formatReceiptDateTime(rawDate);

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
  const cashierName = sale.cashier_name ?? sale.user?.full_name ?? "—";

  const showDiscountColumn = shouldShowPrintDiscountColumn({
    allowDiscounts: productDiscountsEnabled,
  });
  const discountTotals = saleDocumentDiscountTotals({
    items,
    sale,
    orderDiscountEnabled,
  });

  const orderTotal = Number(sale.order_total ?? 0);
  const vatAmount = Number(sale.total_vat ?? 0);
  const subtotalExVat = Math.max(0, orderTotal - vatAmount);
  const cashAmount = Number(sale.cash ?? 0);
  const mpesaAmount = Number(sale.mpesa_amount ?? 0);
  const equityAmount = Number(sale.equity_amount ?? 0);
  const kcbAmount = Number(sale.kcb_amount ?? 0);

  const itemRows = buildSaleDocumentLineRows(items, {
    uomById,
    showDiscountColumn,
    layout: "thermal",
  });
  const tableHead = buildSaleDocumentTableHead({
    showDiscountColumn,
    layout: "thermal",
  });

  const totalPaid =
    cashAmount +
    mpesaAmount +
    equityAmount +
    kcbAmount +
    Number(sale.voucher_payment_amount ?? 0) +
    Number(sale.points_payment_amount ?? 0);
  const changeAmount = Math.max(0, totalPaid - orderTotal);
  const totalDiscount = discountTotals.lineDiscountTotal + discountTotals.orderDiscount;
  const showDiscountTotal =
    (showDiscountColumn || orderDiscountEnabled) && totalDiscount > 0.0001;

  const orgHeader = branding
    ? buildSaleDocumentOrgHeaderHtml(branding, { layout: "thermal" })
    : `<div class="company-name">${escapeHtml(orgName)}</div>`;

  const kraQrHtml = buildKraThermalQrHtml(kraData, kraQrDataUrl);

  const paymentInstructionsHtml =
    showPaymentInstructions && paymentInstructions
      ? buildReceiptPaymentDetailsHtml(paymentInstructions, { layout: "thermal" })
      : "";

  const usedPaymentRows = buildUsedPaymentRows(sale, orderTotal);
  const paymentDetailsHtml = [
    ...usedPaymentRows.map((entry) => paymentDetailRow(entry.label, entry.value)),
    ...(changeAmount > 0.0001 ? [paymentDetailRow("Change", changeAmount)] : []),
  ].join("");

  const totalsHtml = [
    totalsLineRow("Sub total", formatPrintAmount(subtotalExVat)),
    ...(showDiscountTotal ? [totalsLineRow("Discount", formatPrintAmount(totalDiscount))] : []),
    totalsLineRow("VAT", formatPrintAmount(vatAmount)),
    totalsLineRow("Amount", formatPrintAmount(orderTotal), { grand: true }),
  ].join("");

  const footerHtml = buildReceiptFooterHtml(documentFooterText, orgName);

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Receipt ${escapeHtml(receipt)}</title>
  <style>
    body { font-family: ui-monospace, "Courier New", monospace; margin: 0; padding: 12px; color: #111827; background: #fff; font-size: 10px; }
    .receipt { width: 320px; margin: 0 auto; }
    .company-name { text-align: center; font-size: 14px; font-weight: 700; letter-spacing: .04em; margin-bottom: 4px; text-transform: uppercase; }
    .company-meta { text-align: center; font-size: 9px; color: #334155; line-height: 1.45; }
    .doc-title { text-align: center; font-size: 11px; font-weight: 700; letter-spacing: .12em; margin: 10px 0 8px; text-transform: uppercase; }
    .divider { border-top: 1px dashed #64748b; margin: 8px 0; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 8px; font-size: 9px; line-height: 1.4; }
    .meta-label { font-weight: 700; text-transform: uppercase; }
    .meta-value { text-align: right; }
    .meta-full { grid-column: 1 / -1; }
    .table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 9px; }
    .table thead th { padding: 4px 0; border-bottom: 1px solid #111827; font-weight: 700; text-align: left; text-transform: uppercase; font-size: 8px; }
    .table thead th.qty,
    .table thead th.pkg,
    .table thead th.price,
    .table thead th.disc,
    .table thead th.amount { text-align: right; }
    .table tbody tr { border-top: 1px dashed #cbd5e1; }
    .table td { padding: 4px 0; vertical-align: top; }
    .table td.desc { padding-right: 6px; }
    .table td.qty,
    .table td.pkg { text-align: right; white-space: nowrap; }
    .table td.price,
    .table td.disc,
    .table td.amount { text-align: right; white-space: nowrap; }
    .totals { margin-top: 6px; font-size: 9px; }
    .amount-lines { margin: 0; font-size: 9px; }
    .amount-line {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 6.5rem;
      column-gap: 8px;
      align-items: baseline;
      margin: 3px 0;
      text-transform: uppercase;
    }
    .amount-label { font-weight: 700; text-align: left; }
    .amount-value { font-weight: 400; text-align: right; white-space: nowrap; }
    .amount-line-grand { font-size: 11px; font-weight: 700; margin-top: 6px; padding-top: 4px; border-top: 1px solid #111827; }
    .amount-line-grand .amount-value { font-weight: 700; }
    .payment-title { text-align: center; font-weight: 700; letter-spacing: .08em; margin: 8px 0 4px; font-size: 9px; text-transform: uppercase; }
    .pay-instructions { margin: 8px 0; padding-top: 6px; border-top: 1px dashed #cbd5e1; font-size: 9px; }
    .pay-instructions .payment-title { margin-top: 0; }
    .pay-instructions .amount-line { text-transform: none; }
    .pay-instructions .amount-label { font-weight: 700; }
    .pay-note { margin-top: 4px; text-align: center; color: #475569; font-size: 8px; line-height: 1.35; }
    .footer-text { text-align: center; font-size: 8px; color: #334155; margin-top: 6px; text-transform: uppercase; letter-spacing: .04em; line-height: 1.45; }
    .footer-powered-by { text-align: center; font-size: 7px; font-weight: 400; color: #64748b; margin-top: 4px; letter-spacing: normal; line-height: 1.35; }
    .center { text-align: center; }
    @media print { body { padding: 0; } .receipt { margin: 0 auto; } }
  </style>
</head>
<body>
  <div class="receipt">
    ${orgHeader}
    ${branchName ? `<div class="company-meta">${escapeHtml(branchName)}</div>` : ""}
    ${storeAddress ? `<div class="company-meta">${escapeHtml(storeAddress)}</div>` : ""}
    ${storePhones ? `<div class="company-meta">TEL: ${escapeHtml(storePhones)}</div>` : ""}
    ${seller?.email ? `<div class="company-meta">Email: ${escapeHtml(seller.email)}</div>` : ""}
    ${seller?.tax_pin ? `<div class="company-meta">PIN: ${escapeHtml(seller.tax_pin)}</div>` : ""}
    <div class="doc-title">Sales Receipt</div>
    <div class="divider"></div>
    <div class="meta-grid">
      <div><span class="meta-label">Receipt No:</span> ${escapeHtml(receipt)}</div>
      <div class="meta-value"><span class="meta-label">Order No:</span> ${escapeHtml(String(orderNo))}</div>
      <div class="meta-full"><span class="meta-label">Date:</span> ${escapeHtml(dateTime)}</div>
      <div><span class="meta-label">Cashier:</span> ${escapeHtml(cashierName)}</div>
      <div class="meta-value"><span class="meta-label">Till No:</span> ${escapeHtml(String(tillNo))}</div>
      ${customerNameEnabled && customerName ? `<div class="meta-full"><span class="meta-label">Customer:</span> ${escapeHtml(customerName)}</div>` : ""}
      ${customerPhone ? `<div class="meta-full"><span class="meta-label">Phone:</span> ${escapeHtml(customerPhone)}</div>` : ""}
    </div>
    <div class="divider"></div>
    <table class="table">
      <thead>${tableHead}</thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="divider"></div>
    <div class="amount-lines totals">${totalsHtml}</div>
    ${paymentDetailsHtml ? `<div class="divider"></div><div class="amount-lines payments">${paymentDetailsHtml}</div>` : ""}
    ${paymentInstructionsHtml ? `<div class="divider"></div>${paymentInstructionsHtml}` : ""}
    ${kraQrHtml}
    ${footerHtml}
  </div>
</body>
</html>`;

  return html;
}

export function printSaleReceipt(sale, options = {}) {
  const html = buildSaleReceiptHtml(sale, options);
  if (!html) return;
  if (options.printWindow) {
    fillPrintWindow(options.printWindow, html);
    return;
  }
  openPrintWindow(html, "width=420,height=720");
}
