import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { buildKraThermalQrHtml } from "@/lib/kra-receipt-qr";
import { dispatchPrintJob } from "@/lib/print-dispatch";
import { RECEIPT_POWERED_BY_LINE } from "@/lib/print-footer-settings";
import {
  buildSalesDocumentBodyFooterHtml,
  resolveSalesDocumentBodyFooterLines,
  salesDocumentFooterSettings,
} from "@/lib/sales-document-footer";
import {
  buildSaleDocumentLineRows,
  buildSaleDocumentOrgHeaderHtml,
  buildSaleDocumentTableHead,
  escapeHtml,
  formatThermalPrintAmount,
  resolveSaleDocumentStoreContact,
  resolveSaleOrderCreatorName,
  saleDocumentDiscountTotals,
  shouldShowPrintDiscountColumn,
} from "@/lib/sale-document-print-shared";
import { buildReceiptPaymentDetailsHtml } from "@/lib/receipt-payment-details";
import { formatOrderNumber, saleCustomerLabel } from "@/lib/sales";
import { isLegacySale } from "@/lib/sale-line-items";
import {
  createOrgPrintPx,
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
} from "@/lib/print-typography";
import {
  THERMAL_PAPER_WIDTH_MM,
  THERMAL_SIDE_MARGIN_MM,
} from "@/lib/thermal-receipt-layout";

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
  const weekday = d.toLocaleDateString("en-US", { weekday: "long" });
  const day = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "long" });
  const year = d.getFullYear();
  const time = d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true }).toLowerCase();
  return `${weekday}, ${day} ${month} ${year}. ${time}`;
}

function paymentDetailRow(label, value, { plain = false } = {}) {
  const display = plain ? String(value ?? "—") : formatThermalPrintAmount(value);
  return `<tr><td class="amount-label">${escapeHtml(label)}</td><td class="amount-value">${escapeHtml(display)}</td></tr>`;
}

function totalsLineRow(label, value, { grand = false } = {}) {
  return `<tr class="${grand ? "amount-line-grand" : ""}"><td class="amount-label">${escapeHtml(label)}</td><td class="amount-value">${escapeHtml(value)}</td></tr>`;
}

function wrapSummaryTable(rows) {
  if (!rows) return "";
  return `<table class="summary-table">
    <colgroup><col class="col-label" /><col class="col-value" /></colgroup>
    <tbody>${rows}</tbody>
  </table>`;
}

function buildReceiptFooterHtml(documentFooterText, organizationName, context = {}, salesSettings = null) {
  const footerSettings = salesDocumentFooterSettings(
    documentFooterText ? { print_footer_receipt: documentFooterText } : {},
    salesSettings ?? {},
    "receipt",
  );
  const bodyLines = resolveSalesDocumentBodyFooterLines(footerSettings, "receipt", {
    username: context.username ?? "—",
    organizationName,
  });
  const bodyHtml = buildSalesDocumentBodyFooterHtml(bodyLines, { layout: "thermal" });
  const poweredBy = `<div class="footer-powered-by">${escapeHtml(RECEIPT_POWERED_BY_LINE)}</div>`;
  return `${bodyHtml}${poweredBy}`;
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
    moduleSettings = null,
    customerNameEnabled = true,
    showBranchOnReceipt = true,
    branding = null,
    kraData = null,
    kraQrDataUrl = null,
    documentFooterText = "",
    paymentInstructions = null,
    showPaymentInstructions = true,
    generalSettings = null,
    salesSettings = null,
    preparedBy = null,
    user = null,
  } = {},
) {
  if (!sale) return "";

  const printPx = createOrgPrintPx(generalSettings, "thermal");
  const px = printPx.body;
  const hpx = printPx.header;
  const fpx = printPx.footer;
  const font = orgPrintFontFamilyFromSettings(generalSettings, "thermal");

  const items = sale.items ?? [];
  const orderNo = formatOrderNumber(sale);
  const customerName = customer?.customer_name ?? saleCustomerLabel(sale);
  const customerPhone =
    sale.customer_phone ?? sale.customer_mobile ?? customer?.phone_number ?? customer?.additional_phone ?? "";
  const rawDate = sale.completed_at ?? sale.created_at;
  const dateTime = formatReceiptDateTime(rawDate);

  const orgName = seller?.name ?? organizationName;
  const { branchName, storeAddress, storePhones } = resolveSaleDocumentStoreContact({
    showBranchOnReceipt,
    branch,
    seller,
  });
  const tillNo = sale.pos_terminal_id ?? sale.branch_id ?? branch?.id ?? "1";
  const servedByName = (() => {
    const fromSale = resolveSaleOrderCreatorName(sale, preparedBy);
    if (fromSale !== "—") return fromSale;
    return user?.username ?? user?.login ?? "—";
  })();

  const discountTotals = saleDocumentDiscountTotals({
    items,
    sale,
    orderDiscountEnabled,
  });
  const showDiscountColumn =
    shouldShowPrintDiscountColumn({
      moduleSettings,
      allowDiscounts: productDiscountsEnabled || orderDiscountEnabled,
    }) && discountTotals.lineDiscountTotal > 0.0001;

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
    legacyPrint: isLegacySale(sale),
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

  const orgHeader = buildSaleDocumentOrgHeaderHtml(branding, {
    layout: "thermal",
    fallbackName: orgName,
  });

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
    ...(showDiscountTotal ? [totalsLineRow("Discount", formatThermalPrintAmount(totalDiscount))] : []),
    totalsLineRow("Total", formatThermalPrintAmount(orderTotal), { grand: true }),
  ].join("");

  const footerHtml = buildReceiptFooterHtml(documentFooterText, orgName, {
    username: servedByName,
  }, salesSettings);

  const vatHtml =
    vatAmount > 0
      ? (() => {
          const vatRate = subtotalExVat > 0 ? Math.round((vatAmount / subtotalExVat) * 100) : 16;
          return `<div class="divider"></div>${wrapSummaryTable(
            `<tr><td class="amount-label">VAT RATE</td><td class="amount-label amount-value">VAT CHARGED</td></tr>
            <tr><td>${vatRate} %</td><td class="amount-value">${escapeHtml(formatThermalPrintAmount(vatAmount))}</td></tr>`,
          )}<p class="vat-note">Prices inclusive of VAT where applicable</p>`;
        })()
      : "";

  const tableColgroup = showDiscountColumn
    ? `<colgroup><col class="col-desc" /><col class="col-qty" /><col class="col-price" /><col class="col-disc" /><col class="col-amount" /></colgroup>`
    : `<colgroup><col class="col-desc" /><col class="col-qty" /><col class="col-price" /><col class="col-amount" /></colgroup>`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Receipt ${escapeHtml(orderNo)}</title>
  <style>
    @page { size: ${THERMAL_PAPER_WIDTH_MM}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: ${THERMAL_PAPER_WIDTH_MM}mm; max-width: ${THERMAL_PAPER_WIDTH_MM}mm; margin: 0; padding: 0; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    body { font-family: ${font}; color: #000; background: #fff; font-size: ${px(10)}; ${orgPrintInkStyles(generalSettings, "thermal")} }
    body.centrix-print-thermal { padding: 0 ${THERMAL_SIDE_MARGIN_MM}mm; box-sizing: border-box; }
    .receipt { width: 100%; max-width: 100%; margin: 0; padding: 0; box-sizing: border-box; }
    .company-name,
    .org-name { text-align: center; font-size: ${hpx(14)}; font-weight: var(--print-w-header, 700); letter-spacing: .02em; margin-bottom: 4px; }
    .company-meta { text-align: center; font-size: ${hpx(10)}; color: #000; line-height: 1.45; font-weight: var(--print-w-header, 600); word-break: break-word; }
    .doc-title { text-align: center; font-size: ${px(11)}; font-weight: 700; letter-spacing: .08em; margin: 10px 0 8px; }
    .divider { border-top: 1px dashed #000; margin: 6px 0; }
    .meta-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 3px 4px; font-size: ${px(9)}; line-height: 1.4; }
    .meta-cell { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    .meta-cell--sale { text-align: right; }
    .meta-label { font-weight: 700; }
    .meta-value { text-align: right; }
    .meta-full { grid-column: 1 / -1; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    .table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: ${px(9)}; table-layout: fixed; }
    .table col.col-desc { width: 45%; }
    .table col.col-qty { width: 17.5%; }
    .table col.col-price { width: 17.5%; }
    .table col.col-amount { width: 20%; }
    .table.has-disc col.col-desc { width: 45%; }
    .table.has-disc col.col-qty { width: 14%; }
    .table.has-disc col.col-price { width: 14%; }
    .table.has-disc col.col-disc { width: 7%; }
    .table.has-disc col.col-amount { width: 20%; }
    .table thead th { padding: 2px 0; border-bottom: none; font-weight: 700; text-align: left; font-size: ${px(7)}; letter-spacing: 0; }
    .table th.desc, .table td.desc { padding-right: 2px; word-break: break-word; overflow-wrap: anywhere; }
    .table tbody tr { border-top: 1px dashed #000; }
    .table td { padding: 2px 0; vertical-align: top; text-align: left; }
    .table td.qty { white-space: nowrap; line-height: 1.15; font-size: ${px(8)}; }
    .table td.price,
    .table td.disc,
    .table td.amount { white-space: nowrap; font-variant-numeric: tabular-nums; }
    .summary-table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; }
    .summary-table col.col-label { width: 52%; }
    .summary-table col.col-value { width: 48%; }
    .summary-table td { padding: 2px 0; vertical-align: top; }
    .summary-table .amount-label { font-weight: 700; text-align: left; overflow-wrap: anywhere; word-break: break-word; }
    .summary-table .amount-value { font-weight: var(--print-w-body, 600); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .summary-table tr.amount-line-grand td { font-size: ${px(11)}; font-weight: 700; }
    .summary-table tr.amount-line-grand .amount-value { font-weight: 700; }
    .vat-note { margin: 4px 0 0; font-size: 0.85em; line-height: 1.35; }
    .payment-title { text-align: left; font-weight: 700; letter-spacing: .04em; margin: 0 0 6px; font-size: ${px(9)}; }
    .pay-instructions { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #000; font-size: ${px(9)}; text-align: left; }
    .pay-instructions .pay-lines { margin: 0; }
    .pay-instructions .pay-line { margin: 3px 0; line-height: 1.45; text-align: left; word-break: break-word; }
    .pay-instructions .pay-label { font-weight: 700; }
    .pay-instructions .pay-value { font-weight: var(--print-w-body, 600); }
    .pay-instructions .pay-note { margin-top: 6px; text-align: left; color: #000; font-size: ${px(8)}; line-height: 1.35; font-weight: var(--print-w-body, 600); word-break: break-word; }
    .footer-text { font-size: ${fpx(8)}; color: #000; margin-top: 6px; letter-spacing: normal; line-height: 1.45; font-weight: var(--print-w-footer, 700); word-break: break-word; text-transform: none; }
    .footer-line-divider { margin: 4px 0; }
    .footer-powered-by { text-align: center; font-size: ${fpx(7)}; font-weight: var(--print-w-footer, 600); color: #000; margin-top: 4px; letter-spacing: normal; line-height: 1.35; word-break: break-word; text-transform: none; }
    .center { text-align: center; }
    @media print {
      html, body { width: ${THERMAL_PAPER_WIDTH_MM}mm !important; max-width: ${THERMAL_PAPER_WIDTH_MM}mm !important; margin: 0 !important; padding: 0 !important; }
      body.centrix-print-thermal { padding: 0 ${THERMAL_SIDE_MARGIN_MM}mm !important; box-sizing: border-box !important; }
      body { font-size: ${px(10, true)}; }
      .receipt { width: 100% !important; max-width: 100% !important; margin: 0 !important; padding: 0 !important; }
      .company-name,
      .org-name { font-size: ${hpx(14, true)}; }
      .company-meta { font-size: ${hpx(10, true)}; }
      .doc-title { font-size: ${px(11, true)}; }
      .meta-grid { font-size: ${px(9, true)}; }
      .table { font-size: ${px(9, true)}; }
      .table thead th { font-size: ${px(8, true)}; }
      .summary-table { font-size: ${px(9, true)}; }
      .summary-table tr.amount-line-grand td { font-size: ${px(11, true)}; }
      .payment-title, .pay-instructions { font-size: ${px(9, true)}; }
      .pay-instructions .pay-note { font-size: ${px(8, true)}; }
      .footer-text { font-size: ${fpx(8, true)}; }
      .footer-powered-by { font-size: ${fpx(7, true)}; }
    }
  </style>
</head>
<body class="centrix-print-thermal">
  <div class="receipt">
    ${orgHeader}
    ${branchName ? `<div class="company-meta">${escapeHtml(branchName)}</div>` : ""}
    ${storeAddress ? `<div class="company-meta">Address: ${escapeHtml(storeAddress)}</div>` : ""}
    ${storePhones ? `<div class="company-meta">TEL: ${escapeHtml(storePhones)}</div>` : ""}
    ${seller?.tax_pin ? `<div class="company-meta">PIN: ${escapeHtml(seller.tax_pin)}</div>` : ""}
    <div class="meta-grid">
      <div class="meta-cell"><span class="meta-label">Till No:</span> ${escapeHtml(String(tillNo))}</div>
      <div class="meta-cell meta-cell--sale"><span class="meta-label">Cash Sales #:</span> ${escapeHtml(orderNo)}</div>
      ${customerNameEnabled && customerName ? `<div class="meta-full"><span class="meta-label">Customer Name:</span> ${escapeHtml(customerName)}</div>` : ""}
      ${customerPhone ? `<div class="meta-full"><span class="meta-label">Phone:</span> ${escapeHtml(customerPhone)}</div>` : ""}
      <div class="meta-full"><span class="meta-label">Date:</span> ${escapeHtml(dateTime)}</div>
    </div>
    <div class="divider"></div>
    <table class="table${showDiscountColumn ? " has-disc" : ""}">
      ${tableColgroup}
      <thead>${tableHead}</thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="divider"></div>
    <div class="totals">${wrapSummaryTable(totalsHtml)}</div>
    ${paymentDetailsHtml ? `<div class="divider"></div><div class="payments">${wrapSummaryTable(paymentDetailsHtml)}</div>` : ""}
    ${vatHtml}
    ${paymentInstructionsHtml ? paymentInstructionsHtml : ""}
    ${kraQrHtml}
    <div class="divider"></div>
    ${footerHtml}
  </div>
</body>
</html>`;

  return html;
}

export async function printSaleReceipt(sale, options = {}) {
  const html = buildSaleReceiptHtml(sale, options);
  if (!html) return { mode: "browser", ok: false };

  const copies = Math.max(1, Number(options.copies ?? 1) || 1);

  return dispatchPrintJob({
    html,
    copies,
    jobType: "receipt",
    documentId: sale?.id ?? sale?.sale_id ?? null,
    printWindow: options.printWindow ?? null,
    windowFeatures: "width=420,height=720",
  });
}
