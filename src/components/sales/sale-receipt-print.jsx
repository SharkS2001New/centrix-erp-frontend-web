import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import {
  buildKraFiscalBlockHtml,
  buildKraThermalQrHtml,
  resolveBuyerKraPinForReceipt,
} from "@/lib/kra-receipt-qr";
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
import {
  brandingWithDocumentLogo,
  DOCUMENT_LOGO_THERMAL_SIZE_PX,
} from "@/lib/document-logo-settings";
import { buildReceiptPaymentDetailsHtml } from "@/lib/receipt-payment-details";
import { formatOrderNumber, formatCashSalesNumber, isPosChannelSale, saleCustomerLabel } from "@/lib/sales";
import { isLegacySale } from "@/lib/sale-line-items";
import { buildThermalVatChargeGroups } from "@/lib/sales-vat";
import {
  createOrgPrintPx,
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
} from "@/lib/print-typography";
import { formatThermalReceiptDateTime, resolveSaleReceiptTimestamp } from "@/lib/datetime";
import {
  THERMAL_CONTENT_WIDTH_MM,
  THERMAL_PAPER_WIDTH_MM,
} from "@/lib/thermal-receipt-layout";
import { combineIdenticalSaleItemsForPrint } from "@/lib/sale-receipt-line-combine";
import { resolveSaleReceiptChangeGiven, sumSalePaymentAdjustments } from "@/lib/checkout-payment-splits";

function tendersFromSalePayments(sale) {
  const payments = Array.isArray(sale?.payments) ? sale.payments : [];
  const totals = { cash: 0, mpesa: 0, equity: 0, kcb: 0 };
  for (const row of payments) {
    const code = String(
      row?.payment_method?.method_code ??
        row?.paymentMethod?.method_code ??
        row?.method_code ??
        "",
    )
      .trim()
      .toUpperCase();
    const amount = Number(row?.amount ?? 0);
    if (!(amount > 0) || !code) continue;
    if (code.includes("CASH")) totals.cash += amount;
    else if (code.includes("MPESA") || code.includes("AIRTEL")) totals.mpesa += amount;
    else if (code.includes("EQUITY")) totals.equity += amount;
    else if (code.includes("KCB")) totals.kcb += amount;
  }
  return totals;
}

function buildUsedPaymentRows(sale, orderTotal, { showAllMethods = false } = {}) {
  const fromPayments = tendersFromSalePayments(sale);
  let cashAmount = Number(sale.cash ?? 0);
  let mpesaAmount = Number(sale.mpesa_amount ?? 0);
  let equityAmount = Number(sale.equity_amount ?? 0);
  let kcbAmount = Number(sale.kcb_amount ?? 0);

  // If tender columns are empty but sale_payments exist, rebuild from payments.
  const columnTotal = cashAmount + mpesaAmount + equityAmount + kcbAmount;
  if (columnTotal <= 0.009) {
    cashAmount = fromPayments.cash;
    mpesaAmount = fromPayments.mpesa;
    equityAmount = fromPayments.equity;
    kcbAmount = fromPayments.kcb;
  }

  const voucherAmount = Number(sale.voucher_payment_amount ?? 0);
  const pointsAmount = Number(sale.points_payment_amount ?? 0);
  const rows = [];

  if (showAllMethods) {
    // Always print Cash, M-Pesa, Equity, KCB rows so the cashier can see which methods
    // were and were not used at a glance. Voucher/Points only shown when used.
    rows.push({ label: "Cash", value: cashAmount });
    rows.push({ label: "M-Pesa", value: mpesaAmount });
    rows.push({ label: "Equity", value: equityAmount });
    rows.push({ label: "KCB", value: kcbAmount });
  } else {
    if (cashAmount > 0) rows.push({ label: "Cash", value: cashAmount });
    if (mpesaAmount > 0) rows.push({ label: "M-Pesa", value: mpesaAmount });
    if (kcbAmount > 0) rows.push({ label: "KCB", value: kcbAmount });
    if (equityAmount > 0) rows.push({ label: "Equity", value: equityAmount });
  }

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

/** VAT RATE / VAT CHARGED needs a wider value column than totals (80/20). */
function wrapVatSummaryTable(rows) {
  if (!rows) return "";
  return `<table class="summary-table vat-table">
    <colgroup><col class="col-vat-rate" /><col class="col-vat-amt" /></colgroup>
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
    organization = null,
  } = {},
) {
  if (!sale) return "";

  const printPx = createOrgPrintPx(generalSettings, "thermal");
  const px = printPx.body;
  const hpx = printPx.header;
  const fpx = printPx.footer;
  const font = orgPrintFontFamilyFromSettings(generalSettings, "thermal");

  const rawItems = sale.items ?? [];
  // Always combine identical SKUs on the receipt. Cart "combine identical products"
  // only controls the till screen — when off, separate markup lines still print as
  // one row (qty and amounts summed, not re-priced).
  const items = combineIdenticalSaleItemsForPrint(rawItems);
  const isPosSale = isPosChannelSale(sale);
  const cashSalesNo = formatCashSalesNumber(sale);
  const orderNo = formatOrderNumber(sale);
  const saleNumberMeta = isPosSale
    ? `<div class="meta-full"><span class="meta-label">Cash Sales #:</span> ${escapeHtml(cashSalesNo)}</div>`
    : `<div class="meta-full"><span class="meta-label">Order #:</span> ${escapeHtml(orderNo)}</div>`;
  const customerName = customer?.customer_name ?? saleCustomerLabel(sale);
  const customerKraPin =
    resolveBuyerKraPinForReceipt({ sale, customer, kraData }) ?? "";
  const customerPhone =
    sale.customer_phone ?? sale.customer_mobile ?? customer?.phone_number ?? customer?.additional_phone ?? "";
  const rawDate = resolveSaleReceiptTimestamp(sale);
  const dateTime = formatThermalReceiptDateTime(rawDate);

  const orgName = seller?.name ?? organizationName;
  const { branchName, storeAddress, storePhones } = resolveSaleDocumentStoreContact({
    showBranchOnReceipt,
    branch,
    seller,
    organization,
    documentType: "receipt",
    salesSettings,
    moduleSettings,
  });
  const tillNo = sale.pos_terminal_id ?? sale.branch_id ?? branch?.id ?? "1";
  const servedByName = (() => {
    // Prefer the sale cashier / order creator — not the reprinting login.
    const fromSale = resolveSaleOrderCreatorName(sale, preparedBy);
    if (fromSale !== "—") return fromSale;
    return (
      user?.full_name ??
      user?.name ??
      user?.username ??
      user?.login ??
      "—"
    );
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
  const fromPayments = tendersFromSalePayments(sale);
  let cashAmount = Number(sale.cash ?? 0);
  let mpesaAmount = Number(sale.mpesa_amount ?? 0);
  let equityAmount = Number(sale.equity_amount ?? 0);
  let kcbAmount = Number(sale.kcb_amount ?? 0);
  if (cashAmount + mpesaAmount + equityAmount + kcbAmount <= 0.009) {
    cashAmount = fromPayments.cash;
    mpesaAmount = fromPayments.mpesa;
    equityAmount = fromPayments.equity;
    kcbAmount = fromPayments.kcb;
  }

  const itemRows = buildSaleDocumentLineRows(items, {
    uomById,
    showDiscountColumn,
    layout: "thermal",
    legacyPrint: isLegacySale(sale),
    showFullPackageUomOnDocuments: salesSettings?.show_full_package_uom_on_documents === true,
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
  // _cash_tendered is a frontend-only annotation set at checkout time (the amount the customer
  // physically handed over, which may exceed the order total for cash payments). It is never
  // stored on the server. Previous-order edit return/top-up use payment_adjustments — return
  // change is exact; top-up must not appear as "Change Given".
  const changeGiven = resolveSaleReceiptChangeGiven(sale, { totalPaid, orderTotal });
  const topupAmount = Math.max(
    Number(sale?._topup_amount ?? 0),
    sumSalePaymentAdjustments(sale, "topup"),
  );
  const totalDiscount = discountTotals.lineDiscountTotal + discountTotals.orderDiscount;
  const showDiscountTotal =
    (showDiscountColumn || orderDiscountEnabled) && totalDiscount > 0.0001;

  const receiptBranding = brandingWithDocumentLogo(
    branding,
    generalSettings ?? salesSettings,
    "receipt",
  );
  const orgHeader = buildSaleDocumentOrgHeaderHtml(receiptBranding, {
    layout: "thermal",
    fallbackName: orgName,
  });

  const thermalLogoDims =
    DOCUMENT_LOGO_THERMAL_SIZE_PX[receiptBranding?.logoLayout?.size ?? "small"] ??
    DOCUMENT_LOGO_THERMAL_SIZE_PX.small;

  // Fiscal thermal receipts: QR below Designed & Developed. Fall back to CU text if QR image failed.
  // After the QR, show the buyer's KRA PIN (or CU invoice when PIN is missing).
  const kraQrHtml = kraData
    ? buildKraThermalQrHtml(kraData, kraQrDataUrl, { buyerPin: customerKraPin }) ||
      buildKraFiscalBlockHtml(kraData, {
        layout: "thermal",
        qrDataUrl: kraQrDataUrl,
        title: "KRA eTIMS",
        buyerPin: customerKraPin,
      })
    : "";

  const paymentInstructionsHtml =
    showPaymentInstructions && paymentInstructions
      ? buildReceiptPaymentDetailsHtml(paymentInstructions, { layout: "thermal" })
      : "";

  const showAllPaymentMethods = salesSettings?.receipt_show_all_payment_methods !== false;
  const usedPaymentRows = buildUsedPaymentRows(sale, orderTotal, { showAllMethods: showAllPaymentMethods });
  const paymentDetailsHtml = [
    ...usedPaymentRows.map((entry) => paymentDetailRow(entry.label, entry.value)),
    ...(topupAmount > 0.0001 ? [paymentDetailRow("Top-up amount", topupAmount)] : []),
    ...(changeGiven > 0.0001 ? [paymentDetailRow("Change Given", changeGiven)] : []),
  ].join("");

  const totalsHtml = [
    ...(showDiscountTotal ? [totalsLineRow("Discount", formatThermalPrintAmount(totalDiscount))] : []),
    totalsLineRow("Total", formatThermalPrintAmount(orderTotal), { grand: true }),
  ].join("");

  const footerHtml = buildReceiptFooterHtml(documentFooterText, orgName, {
    username: servedByName,
  }, salesSettings);

  const vatHtml = (() => {
    const groups = buildThermalVatChargeGroups(items, { totalVat: vatAmount });
    const rows = [
      `<tr><td class="amount-label">VAT RATE</td><td class="amount-label vat-charged-label">VAT AMT</td></tr>`,
      ...groups.map(
        (group) =>
          `<tr><td>${escapeHtml(group.label)}</td><td class="amount-value">${escapeHtml(formatThermalPrintAmount(group.amount))}</td></tr>`,
      ),
    ].join("");
    return `<div class="divider"></div>${wrapVatSummaryTable(rows)}<p class="vat-note">Prices inclusive of VAT where applicable</p>`;
  })();

  const tableColgroup = showDiscountColumn
    ? `<colgroup><col class="col-desc" /><col class="col-qty" /><col class="col-price" /><col class="col-disc" /><col class="col-amount" /></colgroup>`
    : `<colgroup><col class="col-desc" /><col class="col-qty" /><col class="col-price" /><col class="col-amount" /></colgroup>`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <title>Receipt ${escapeHtml(cashSalesNo)}</title>
  <style>
    @page { size: ${THERMAL_PAPER_WIDTH_MM}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: ${THERMAL_PAPER_WIDTH_MM}mm; max-width: ${THERMAL_PAPER_WIDTH_MM}mm; height: auto; min-height: 0; margin: 0 auto; padding: 0; -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }
    body { font-family: ${font}; color: #000; background: #fff; font-size: ${px(10)}; ${orgPrintInkStyles(generalSettings, "thermal")} }
    .receipt { width: ${THERMAL_CONTENT_WIDTH_MM}mm; max-width: ${THERMAL_CONTENT_WIDTH_MM}mm; margin: 0 auto; padding: 0; box-sizing: border-box; page-break-inside: avoid; break-inside: avoid; }
    .org-brand,
    .org-header { margin: 0; padding: 0; max-width: 100%; }
    .org-logo { display: block; margin: 0 auto 2px; max-height: ${thermalLogoDims.maxHeight}px; max-width: ${thermalLogoDims.maxWidth}px; object-fit: contain; }
    .company-name,
    .org-name { text-align: center; font-size: ${hpx(13)}; font-weight: var(--print-w-header, 700); letter-spacing: .02em; line-height: 1.12; margin: 0 0 2px; word-break: break-word; overflow-wrap: anywhere; }
    .company-meta { text-align: center; font-size: ${hpx(9)}; color: #000; line-height: 1.15; margin: 0; font-weight: var(--print-w-header, 600); word-break: break-word; overflow-wrap: anywhere; }
    .doc-title { text-align: center; font-size: ${px(11)}; font-weight: 700; letter-spacing: .08em; margin: 10px 0 8px; }
    .divider { border-top: 1px dashed #000; margin: 4px 0; }
    .meta-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 2px 4px; font-size: ${px(9)}; line-height: 1.25; max-width: 100%; }
    .meta-cell { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    .meta-cell--sale { text-align: right; }
    .meta-label { font-weight: 700; }
    .meta-value { text-align: right; }
    .meta-full { grid-column: 1 / -1; min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    .table { width: 100%; max-width: 100%; border-collapse: collapse; margin: 4px 0; font-size: ${px(8)}; table-layout: fixed; }
    .table col.col-desc { width: 44%; }
    .table col.col-qty { width: 12%; }
    .table col.col-price { width: 18%; }
    .table col.col-amount { width: 26%; }
    .table.has-disc col.col-desc { width: 36%; }
    .table.has-disc col.col-qty { width: 10%; }
    .table.has-disc col.col-price { width: 16%; }
    .table.has-disc col.col-disc { width: 10%; }
    .table.has-disc col.col-amount { width: 28%; }
    .table thead th { padding: 1px 0; border-bottom: none; font-weight: 700; text-align: left; font-size: ${px(7)}; letter-spacing: 0; }
    .table thead th.qty,
    .table thead th.price,
    .table thead th.disc,
    .table thead th.amount { text-align: right; padding-left: 0; padding-right: 0; }
    .table th.desc, .table td.desc { padding-right: 2px; word-break: break-word; overflow-wrap: anywhere; }
    .table tbody tr { border-top: 1px dashed #000; }
    .table td { padding: 1px 0; vertical-align: top; text-align: left; }
    .table td.qty { white-space: nowrap; line-height: 1.15; font-size: ${px(7.5)}; text-align: right; padding-left: 0; padding-right: 0; }
    .table td.price,
    .table td.disc,
    .table td.amount { white-space: nowrap; font-variant-numeric: tabular-nums; text-align: right; padding-left: 0; padding-right: 0; }
    .summary-table { width: 100%; max-width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0; font-size: ${px(8)}; }
    .summary-table col.col-label { width: 52%; }
    .summary-table col.col-value { width: 48%; }
    .summary-table.vat-table col.col-vat-rate { width: 52%; }
    .summary-table.vat-table col.col-vat-amt { width: 48%; }
    .summary-table td { padding: 1px 0; vertical-align: top; }
    .summary-table .amount-label { font-weight: 700; text-align: left; overflow-wrap: anywhere; word-break: break-word; padding-right: 4px; }
    .summary-table .amount-value { font-weight: var(--print-w-body, 600); text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .summary-table.vat-table .amount-label,
    .summary-table.vat-table .vat-charged-label { font-size: ${px(7)}; letter-spacing: 0; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
    .summary-table.vat-table .vat-charged-label { padding-left: 0; text-align: right; }
    .summary-table.vat-table .amount-value { text-align: right; }
    .summary-table tr.amount-line-grand td { font-size: ${px(10)}; font-weight: 700; }
    .summary-table tr.amount-line-grand .amount-value { font-weight: 700; }
    .vat-note { margin: 4px 0 0; font-size: 0.85em; line-height: 1.35; overflow-wrap: anywhere; word-break: break-word; }
    .payment-title { text-align: left; font-weight: 700; letter-spacing: .04em; margin: 0 0 6px; font-size: ${px(9)}; }
    .pay-instructions { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #000; font-size: ${px(9)}; text-align: left; max-width: 100%; }
    .pay-instructions .pay-lines { margin: 0; }
    .pay-instructions .pay-block { margin: 0 0 6px; }
    .pay-instructions .pay-block:last-child { margin-bottom: 0; }
    .pay-instructions .pay-block-title { font-weight: 700; margin: 0 0 3px; letter-spacing: .02em; }
    .pay-instructions .pay-line { margin: 3px 0; line-height: 1.45; text-align: left; word-break: break-word; overflow-wrap: anywhere; }
    .pay-instructions .pay-label { font-weight: 700; }
    .pay-instructions .pay-value { font-weight: var(--print-w-body, 600); }
    .pay-instructions .pay-note { margin-top: 6px; text-align: left; color: #000; font-size: ${px(8)}; line-height: 1.35; font-weight: var(--print-w-body, 600); word-break: break-word; overflow-wrap: anywhere; }
    .footer-text { font-size: ${fpx(8)}; color: #000; margin-top: 3px; letter-spacing: normal; line-height: 1.3; font-weight: var(--print-w-footer, 700); word-break: break-word; overflow-wrap: anywhere; text-transform: none; }
    .footer-line-divider { margin: 3px 0; }
    .footer-powered-by { text-align: center; font-size: ${fpx(7)}; font-weight: var(--print-w-footer, 600); color: #000; margin-top: 2px; letter-spacing: normal; line-height: 1.25; word-break: break-word; overflow-wrap: anywhere; text-transform: none; }
    .kra-etims-block { page-break-inside: avoid; break-inside: avoid; max-width: 100%; overflow: hidden; box-sizing: border-box; }
    .kra-etims-caption { margin-top: 4px; font-size: ${px(8)}; font-weight: 700; color: #000; line-height: 1.35; text-align: center; padding: 0 1px; overflow-wrap: anywhere; word-break: break-word; }
    .center { text-align: center; }
    @media print {
      html, body { width: ${THERMAL_PAPER_WIDTH_MM}mm !important; max-width: ${THERMAL_PAPER_WIDTH_MM}mm !important; height: auto !important; min-height: 0 !important; margin: 0 auto !important; padding: 0 !important; }
      body { font-size: ${px(10, true)}; }
      .receipt { width: ${THERMAL_CONTENT_WIDTH_MM}mm !important; max-width: ${THERMAL_CONTENT_WIDTH_MM}mm !important; margin: 0 auto !important; padding: 0 !important; overflow: visible !important; }
      .org-brand,
      .org-header { margin: 0 !important; padding: 0 !important; max-width: 100% !important; }
      .org-logo { margin: 0 auto 2px !important; max-height: ${thermalLogoDims.maxHeight}px !important; max-width: ${thermalLogoDims.maxWidth}px !important; }
      .company-name,
      .org-name { font-size: ${hpx(13, true)}; }
      .company-meta { font-size: ${hpx(9, true)}; }
      .doc-title { font-size: ${px(11, true)}; }
      .meta-grid { font-size: ${px(9, true)}; }
      .table { font-size: ${px(8, true)}; }
      .table thead th { font-size: ${px(7, true)}; }
      .table td.qty { font-size: ${px(7.5, true)}; }
      .summary-table { font-size: ${px(8, true)}; }
      .summary-table.vat-table .amount-label,
      .summary-table.vat-table .vat-charged-label { font-size: ${px(7, true)}; }
      .summary-table.vat-table .vat-charged-label { padding-left: 0; text-align: right; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
      .summary-table tr.amount-line-grand td { font-size: ${px(10, true)}; }
      .payment-title, .pay-instructions { font-size: ${px(9, true)}; }
      .pay-instructions .pay-note { font-size: ${px(8, true)}; }
      .footer-text { font-size: ${fpx(8, true)}; }
      .footer-powered-by { font-size: ${fpx(7, true)}; }
      .kra-etims-caption { font-size: ${px(8, true)}; padding: 0 1px; overflow-wrap: anywhere; word-break: break-word; }
      .kra-buyer-pin, .kra-buyer-detail { font-size: ${px(9, true)}; font-weight: 700; }
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
      <div class="meta-full"><span class="meta-label">Till No:</span> ${escapeHtml(String(tillNo))}</div>
      ${saleNumberMeta}
      ${customerNameEnabled && customerName ? `<div class="meta-full"><span class="meta-label">Customer Name:</span> ${escapeHtml(String(customerName).toUpperCase())}</div>` : ""}
      ${customerKraPin ? `<div class="meta-full"><span class="meta-label">Customer PIN:</span> ${escapeHtml(customerKraPin)}</div>` : ""}
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
    <div class="divider"></div>
    ${footerHtml}
    ${kraQrHtml}
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
