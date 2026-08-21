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
} from "@/lib/print-typography";
import { formatThermalReceiptDateTime, resolveSaleReceiptTimestamp } from "@/lib/datetime";
import { buildThermalReceiptCss } from "@/lib/thermal-receipt-layout";
import { combineIdenticalSaleItemsForPrint } from "@/lib/sale-receipt-line-combine";
import { resolveSaleReceiptChangeGiven, resolveSaleReceiptTopupAmount } from "@/lib/checkout-payment-splits";
import { orgDocumentTemplateCss } from "@/lib/document-print-templates";

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

function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

/**
 * Resolve tender amounts for thermal receipts.
 * amount_paid is the paid truth — unpaid orders must not invent Cash from payment_method_code
 * or stale tender columns.
 */
export function resolveSaleReceiptTenders(sale, orderTotal) {
  const total = roundMoney(orderTotal ?? sale?.order_total ?? 0);
  const amountPaid = Math.max(0, roundMoney(sale?.amount_paid ?? 0));
  const fromPayments = tendersFromSalePayments(sale);

  let cashAmount = Math.max(0, roundMoney(sale?.cash ?? 0));
  let mpesaAmount = Math.max(0, roundMoney(sale?.mpesa_amount ?? 0));
  let equityAmount = Math.max(0, roundMoney(sale?.equity_amount ?? 0));
  let kcbAmount = Math.max(0, roundMoney(sale?.kcb_amount ?? 0));

  // If tender columns are empty but sale_payments exist, rebuild from payments.
  const columnTotal = cashAmount + mpesaAmount + equityAmount + kcbAmount;
  if (columnTotal <= 0.009) {
    cashAmount = fromPayments.cash;
    mpesaAmount = fromPayments.mpesa;
    equityAmount = fromPayments.equity;
    kcbAmount = fromPayments.kcb;
  }

  let voucherAmount = Math.max(0, roundMoney(sale?.voucher_payment_amount ?? 0));
  let pointsAmount = Math.max(0, roundMoney(sale?.points_payment_amount ?? 0));

  // Fully unpaid: ignore stale cash/mpesa columns and never invent a full-bill tender.
  if (amountPaid <= 0.009) {
    return {
      cashAmount: 0,
      mpesaAmount: 0,
      equityAmount: 0,
      kcbAmount: 0,
      voucherAmount: 0,
      pointsAmount: 0,
      amountPaid: 0,
      tenderPaid: 0,
      balanceDue: Math.max(0, total),
    };
  }

  let tenderPaid = roundMoney(
    cashAmount + mpesaAmount + equityAmount + kcbAmount + voucherAmount + pointsAmount,
  );

  // Columns empty but amount_paid is set — attribute paid amount to the recorded method.
  if (tenderPaid <= 0.009) {
    const code = String(sale?.payment_method_code ?? "CASH").toUpperCase();
    if (code.includes("MPESA") || code.includes("AIRTEL")) mpesaAmount = amountPaid;
    else if (code.includes("EQUITY")) equityAmount = amountPaid;
    else if (code.includes("KCB")) kcbAmount = amountPaid;
    else if (code.includes("CREDIT")) {
      /* credit balance is shown separately */
    } else if (code.includes("VOUCHER")) voucherAmount = amountPaid;
    else if (code.includes("POINT")) pointsAmount = amountPaid;
    else cashAmount = amountPaid;
    tenderPaid = amountPaid;
  } else if (tenderPaid > amountPaid + 0.02) {
    // Cashier may have tendered more than the bill (change). Keep those method amounts
    // when the excess matches recorded change / cash tendered — do not clamp to order total.
    const knownChange = Math.max(
      0,
      roundMoney(sale?._change_given ?? 0),
      roundMoney(sale?.order_change ?? 0),
    );
    const cashTendered = Math.max(0, roundMoney(sale?._cash_tendered ?? 0));
    const excess = roundMoney(tenderPaid - amountPaid);
    const matchesKnownChange =
      knownChange > 0.009 && Math.abs(excess - knownChange) <= 0.05;
    const matchesCashTendered =
      cashTendered > amountPaid + 0.02 && Math.abs(tenderPaid - cashTendered) <= 0.05;
    const matchesBillPlusChange =
      total > 0.01 &&
      knownChange > 0.009 &&
      Math.abs(tenderPaid - (total + knownChange)) <= 0.05;

    if (!matchesKnownChange && !matchesCashTendered && !matchesBillPlusChange) {
      // Stale tender columns above amount_paid — trust amount_paid and rebuild from method.
      cashAmount = 0;
      mpesaAmount = 0;
      equityAmount = 0;
      kcbAmount = 0;
      voucherAmount = 0;
      pointsAmount = 0;
      const code = String(sale?.payment_method_code ?? "CASH").toUpperCase();
      if (code.includes("MPESA") || code.includes("AIRTEL")) mpesaAmount = amountPaid;
      else if (code.includes("EQUITY")) equityAmount = amountPaid;
      else if (code.includes("KCB")) kcbAmount = amountPaid;
      else if (!code.includes("CREDIT")) cashAmount = amountPaid;
      tenderPaid = amountPaid;
    }
  }

  return {
    cashAmount,
    mpesaAmount,
    equityAmount,
    kcbAmount,
    voucherAmount,
    pointsAmount,
    amountPaid,
    tenderPaid,
    balanceDue: Math.max(0, roundMoney(total - amountPaid)),
  };
}

export function buildUsedPaymentRows(sale, orderTotal, { showAllMethods = false } = {}) {
  const tenders = resolveSaleReceiptTenders(sale, orderTotal);
  const {
    cashAmount,
    mpesaAmount,
    equityAmount,
    kcbAmount,
    voucherAmount,
    pointsAmount,
    balanceDue,
  } = tenders;
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

  if (sale?.is_credit_sale && balanceDue > 0.0001) {
    rows.push({ label: "Credit", value: balanceDue });
  } else if (balanceDue > 0.0001) {
    // Unpaid / partial mobile & till receipts — always surface the outstanding balance.
    rows.push({ label: "Balance due", value: balanceDue });
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
  const receiptTenders = resolveSaleReceiptTenders(sale, orderTotal);

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

  // Prefer amount_paid so unpaid/partial receipts never treat stale cash columns as paid.
  // When the customer overpaid (change), tenderPaid may exceed amount_paid — use the higher
  // so Change Given and method rows stay aligned (e.g. M-Pesa 5000 on a 4950 bill).
  const totalPaid = Math.max(receiptTenders.amountPaid, receiptTenders.tenderPaid);
  // _cash_tendered is a frontend-only annotation set at checkout time (the amount the customer
  // physically handed over, which may exceed the order total for cash payments). It is never
  // stored on the server. Previous-order edit return/top-up use payment_adjustments — return
  // change is exact; top-up must not appear as "Change Given".
  const changeGiven = resolveSaleReceiptChangeGiven(sale, { totalPaid, orderTotal });
  // Previous-order edit: Cash/M-Pesa already include prior + top-up. Never print a
  // separate Top-up row on top of a fully settled tender total (looks like double pay).
  const topupAmount = resolveSaleReceiptTopupAmount(sale, { totalPaid, orderTotal });
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
    ${buildThermalReceiptCss({
      printPx,
      font,
      generalSettings,
      thermalLogoDims,
      templateCss: orgDocumentTemplateCss(salesSettings?.receipt_document_template, { layout: "thermal" }),
    })}
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
    ${kraQrHtml ? `<div class="receipt-tearoff" aria-hidden="true"></div>` : ""}
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
