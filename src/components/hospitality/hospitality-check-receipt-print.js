import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import {
  brandingWithDocumentLogo,
  DOCUMENT_LOGO_THERMAL_SIZE_PX,
} from "@/lib/document-logo-settings";
import { formatThermalReceiptDateTime } from "@/lib/datetime";
import { formatHotelMoney } from "@/lib/hotel-pos-settings";
import { RECEIPT_POWERED_BY_LINE } from "@/lib/print-footer-settings";
import { dispatchPrintJob } from "@/lib/print-dispatch";
import {
  createOrgPrintPx,
  orgPrintFontFamilyFromSettings,
} from "@/lib/print-typography";
import { buildReceiptPaymentDetailsHtml } from "@/lib/receipt-payment-details";
import {
  buildSaleDocumentOrgHeaderHtml,
  escapeHtml,
  formatThermalPrintAmount,
  resolveSaleDocumentBranding,
} from "@/lib/sale-document-print-shared";
import {
  buildSalesDocumentBodyFooterHtml,
  resolveSalesDocumentBodyFooterLines,
  salesDocumentFooterSettings,
} from "@/lib/sales-document-footer";
import {
  buildThermalReceiptCss,
  THERMAL_PAPER_WIDTH_MM,
} from "@/lib/thermal-receipt-layout";
import { orgDocumentTemplateCss } from "@/lib/document-print-templates";

const DEFAULT_HOTEL_FOOTER = [
  "You were served by: {username}",
  "Thank you for dining with us",
  "Please check your bill carefully",
].join("\n");

/**
 * Build 80mm thermal HTML for a hospitality check (Hotel / Bar POS).
 * Matches retail thermal customization (fonts, logo, footer, payment instructions)
 * with a guest-check layout typical of hotel F&B receipts.
 *
 * @param {object} check
 * @param {object} [options]
 * @returns {string|null}
 */
export function buildHospitalityCheckReceiptHtml(check, options = {}) {
  if (!check) return null;

  const {
    title = null,
    organization = null,
    printSettings = null,
    generalSettings = null,
    seller = null,
    branding = null,
    user = null,
    preparedBy = null,
    paymentInstructions = null,
    showPaymentInstructions = null,
  } = options;

  const showOrg = printSettings?.show_organization_on_check_receipt !== false;
  const showOutlet = printSettings?.show_outlet_on_check_receipt !== false;
  const showGuestName = printSettings?.enable_check_guest_name === true;
  const showAddress = printSettings?.show_address_on_check_receipt !== false;
  const showTaxPin = printSettings?.show_tax_pin_on_check_receipt !== false;
  const showUnitPrice = printSettings?.show_unit_price_on_check_receipt !== false;
  const showCashier = printSettings?.show_cashier_on_check_receipt !== false;
  const showDateTime = printSettings?.show_datetime_on_check_receipt !== false;
  const showAllPaymentMethods = printSettings?.check_receipt_show_all_payment_methods === true;

  const useSamePhones = printSettings?.use_same_print_phones_for_check !== false;
  const phones = useSamePhones
    ? {
        tel1: seller?.phone ?? organization?.primary_tel ?? "",
        tel2: seller?.secondary_phone ?? organization?.secondary_tel ?? "",
      }
    : {
        tel1: printSettings?.check_print_phones?.tel1 ?? "",
        tel2: printSettings?.check_print_phones?.tel2 ?? "",
      };
  const phoneLine = [phones.tel1, phones.tel2]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(" / ");

  const printPx = createOrgPrintPx(generalSettings, "thermal");
  const font = orgPrintFontFamilyFromSettings(generalSettings, "thermal");

  const orgName =
    String(seller?.name ?? organization?.org_name ?? "").trim() || DEFAULT_PRINT_ORG_NAME;
  const storeAddress = String(
    seller?.address ?? organization?.org_address ?? organization?.address ?? "",
  ).trim();
  const taxPin = String(seller?.tax_pin ?? organization?.org_pin ?? "").trim();

  const resolvedBranding =
    branding ??
    resolveSaleDocumentBranding({
      organization,
      generalSettings,
    });
  const receiptBranding = brandingWithDocumentLogo(
    showOrg ? resolvedBranding : { ...resolvedBranding, showHeader: false },
    generalSettings,
    "hospitality_check",
  );
  const orgHeader = showOrg
    ? buildSaleDocumentOrgHeaderHtml(receiptBranding, {
        layout: "thermal",
        fallbackName: orgName,
      })
    : "";

  const thermalLogoDims =
    DOCUMENT_LOGO_THERMAL_SIZE_PX[receiptBranding?.logoLayout?.size ?? "small"] ??
    DOCUMENT_LOGO_THERMAL_SIZE_PX.small;

  const lines = Array.isArray(check.lines) ? check.lines : [];
  const payments = Array.isArray(check.payments) ? check.payments : [];
  const status = String(check.status ?? "").replace(/_/g, " ");
  const tableLabel = check.floor_table?.label || check.floor_table?.code || "";
  const outletLabel = check.outlet?.name || check.outlet?.code || "";
  const guestName = String(check.guest_name ?? check.folio?.guest_name ?? "").trim();
  const roomStayLines = lines.filter(
    (line) => line?.is_room_stay || line?.modifiers?.type === "room_stay",
  );
  const roomStayMeta = roomStayLines[0]?.modifiers ?? null;
  const roomNumber = String(
    check.folio?.room_number ?? roomStayMeta?.room_number ?? "",
  ).trim();
  const folioNumber = String(check.folio?.folio_number ?? "").trim();
  const checkNumber = String(check.check_number ?? "").trim();
  const serviceMode = formatServiceMode(check.service_mode);
  const nightsLabel = roomStayMeta?.nights
    ? `${roomStayMeta.nights} night${Number(roomStayMeta.nights) === 1 ? "" : "s"}`
    : "";
  const checkoutLabel = roomStayMeta?.checkout_at
    ? formatThermalReceiptDateTime(roomStayMeta.checkout_at)
    : "";
  const paid = Number(check.amount_paid) || 0;
  const total = Number(check.total) || 0;
  const vat = Number(check.vat_total) || 0;
  const subtotal = Number(check.subtotal) || Math.max(0, total - vat);
  const serviceCharge = Number(check.service_charge) || 0;
  const balance = Number(check.balance_due ?? Math.max(0, total - paid)) || 0;
  const changeGiven = Math.max(0, paid - total);

  const servedByName = resolveServedByName(check, { preparedBy, user });
  const dateRaw = check.closed_at || check.updated_at || check.opened_at || null;
  const dateTime = dateRaw ? formatThermalReceiptDateTime(dateRaw) : formatThermalReceiptDateTime(new Date());

  const docTitle = resolveGuestCheckTitle(title, check, status);
  const itemRows = buildCheckLineRows(lines, { showUnitPrice });
  const tableColgroup = showUnitPrice
    ? `<colgroup><col class="col-desc" /><col class="col-qty" /><col class="col-price" /><col class="col-amount" /></colgroup>`
    : `<colgroup><col class="col-desc" /><col class="col-qty" /><col class="col-amount" /></colgroup>`;
  const tableHead = showUnitPrice
    ? `<tr><th class="desc">ITEM</th><th class="qty">QTY</th><th class="price">PRICE</th><th class="amount">AMOUNT</th></tr>`
    : `<tr><th class="desc">ITEM</th><th class="qty">QTY</th><th class="amount">AMOUNT</th></tr>`;

  const totalsHtml = [
    subtotal > 0.0001 && Math.abs(subtotal - total) > 0.009
      ? totalsLineRow("Subtotal", formatThermalPrintAmount(subtotal))
      : "",
    serviceCharge > 0.0001
      ? totalsLineRow("Service charge", formatThermalPrintAmount(serviceCharge))
      : "",
    vat > 0.0001 ? totalsLineRow("VAT", formatThermalPrintAmount(vat)) : "",
    totalsLineRow("Total", formatThermalPrintAmount(total), { grand: true }),
  ]
    .filter(Boolean)
    .join("");

  const tenderRows = buildCheckTenderRows(payments, {
    showAllMethods: showAllPaymentMethods,
    paid,
    total,
  });
  const paymentDetailsHtml = [
    ...tenderRows.map((entry) => paymentDetailRow(entry.label, entry.value)),
    paymentDetailRow("Paid", paid),
    balance > 0.0001 ? paymentDetailRow("Balance due", balance) : "",
    changeGiven > 0.0001 ? paymentDetailRow("Change", changeGiven) : "",
  ]
    .filter(Boolean)
    .join("");

  const shouldShowPayInstructions =
    showPaymentInstructions != null
      ? Boolean(showPaymentInstructions)
      : printSettings?.show_check_payment_details !== false;
  const paymentInstructionsHtml =
    shouldShowPayInstructions && paymentInstructions
      ? buildReceiptPaymentDetailsHtml(paymentInstructions, { layout: "thermal" })
      : "";

  const footerText =
    String(printSettings?.check_receipt_footer ?? "").trim() || DEFAULT_HOTEL_FOOTER;
  const footerHtml = buildCheckFooterHtml(footerText, orgName, {
    username: servedByName,
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docTitle)}${checkNumber ? ` ${escapeHtml(checkNumber)}` : ""}</title>
  <style>
    ${buildThermalReceiptCss({
      printPx,
      font,
      generalSettings,
      thermalLogoDims,
      templateCss: orgDocumentTemplateCss(printSettings?.hospitality_check_document_template, { layout: "thermal" }),
    })}
  </style>
</head>
<body class="centrix-print-thermal">
  <div class="receipt">
    ${orgHeader}
    ${showAddress && storeAddress ? `<div class="company-meta">${escapeHtml(storeAddress)}</div>` : ""}
    ${phoneLine ? `<div class="company-meta">TEL: ${escapeHtml(phoneLine)}</div>` : ""}
    ${showTaxPin && taxPin ? `<div class="company-meta">PIN: ${escapeHtml(taxPin)}</div>` : ""}
    <div class="doc-title">${escapeHtml(docTitle)}</div>
    ${status && !/^paid$/i.test(status) ? `<div class="doc-subtitle">${escapeHtml(status)}</div>` : ""}
    <div class="meta-grid">
      ${checkNumber ? `<div class="meta-full"><span class="meta-label">Order no:</span> ${escapeHtml(checkNumber)}</div>` : ""}
      ${showDateTime ? `<div class="meta-full"><span class="meta-label">Date:</span> ${escapeHtml(dateTime)}</div>` : ""}
      ${showOutlet && outletLabel ? `<div class="meta-full"><span class="meta-label">Outlet:</span> ${escapeHtml(outletLabel)}</div>` : ""}
      ${tableLabel ? `<div class="meta-full"><span class="meta-label">Table:</span> ${escapeHtml(tableLabel)}</div>` : ""}
      ${roomNumber ? `<div class="meta-full"><span class="meta-label">Room:</span> ${escapeHtml(roomNumber)}</div>` : ""}
      ${nightsLabel ? `<div class="meta-full"><span class="meta-label">Nights:</span> ${escapeHtml(nightsLabel)}</div>` : ""}
      ${checkoutLabel ? `<div class="meta-full"><span class="meta-label">Checkout:</span> ${escapeHtml(checkoutLabel)}</div>` : ""}
      ${folioNumber ? `<div class="meta-full"><span class="meta-label">Folio:</span> ${escapeHtml(folioNumber)}</div>` : ""}
      ${showGuestName && guestName ? `<div class="meta-full"><span class="meta-label">Guest:</span> ${escapeHtml(guestName.toUpperCase())}</div>` : ""}
      ${serviceMode ? `<div class="meta-full"><span class="meta-label">Service:</span> ${escapeHtml(serviceMode)}</div>` : ""}
      ${showCashier ? `<div class="meta-full"><span class="meta-label">Server:</span> ${escapeHtml(servedByName)}</div>` : ""}
    </div>
    <div class="divider"></div>
    <table class="table${showUnitPrice ? "" : " no-price"}">
      ${tableColgroup}
      <thead>${tableHead}</thead>
      <tbody>${itemRows}</tbody>
    </table>
    <div class="divider"></div>
    <div class="totals">${wrapSummaryTable(totalsHtml)}</div>
    ${paymentDetailsHtml ? `<div class="divider"></div><div class="payments">${wrapSummaryTable(paymentDetailsHtml)}</div>` : ""}
    ${vat > 0.0001 ? `<p class="vat-note">Prices inclusive of VAT where applicable</p>` : ""}
    ${paymentInstructionsHtml || ""}
    <div class="divider"></div>
    ${footerHtml}
  </div>
</body>
</html>`;
}

/**
 * Print a hospitality check receipt via Centrix Print Agent (thermal) or browser fallback.
 * Browser fallback keeps Hotel POS "Pay now" receipts working when the agent is offline
 * (same behavior as retail POS).
 *
 * @returns {Promise<{ mode: "agent" | "browser", ok: boolean, printer?: string, jobId?: string, error?: string } | null>}
 */
export async function printHospitalityCheckReceipt(check, options = {}) {
  if (!check || typeof window === "undefined") return null;

  const html = buildHospitalityCheckReceiptHtml(check, options);
  if (!html) return null;

  const copies = Math.min(
    3,
    Math.max(1, Number(options.printSettings?.check_receipt_copies) || 1),
  );

  return dispatchPrintJob({
    html,
    copies,
    jobType: "receipt",
    documentId: check?.id ?? check?.check_number ?? null,
    printWindow: options.printWindow ?? null,
    windowFeatures: `width=420,height=720`,
    allowBrowserFallback: options.allowBrowserFallback !== false,
  });
}

/** Sample check for Admin → Printouts live preview. */
export function sampleHospitalityCheckPreviewData() {
  return {
    id: 1,
    check_number: "HTL-000128",
    status: "paid",
    service_mode: "dine_in",
    guest_name: "Jane Guest",
    outlet: { id: 1, code: "HOTEL", name: "Restaurant", outlet_type: "restaurant" },
    floor_table: { id: 3, code: "T12", label: "Table 12" },
    subtotal: 1850,
    vat_total: 296,
    service_charge: 0,
    total: 2146,
    amount_paid: 2200,
    balance_due: 0,
    opened_at: new Date().toISOString(),
    closed_at: new Date().toISOString(),
    lines: [
      {
        description: "Beef stew",
        qty: 1,
        unit_price: 650,
        line_total: 650,
      },
      {
        description: "Chips",
        qty: 2,
        unit_price: 250,
        line_total: 500,
      },
      {
        description: "Soda 500ml",
        qty: 2,
        unit_price: 150,
        line_total: 300,
      },
      {
        description: "Black Coffee",
        qty: 2,
        unit_price: 200,
        line_total: 400,
      },
    ],
    payments: [
      { method_code: "CASH", amount: 2200 },
    ],
  };
}

/** @deprecated Prefer THERMAL_PAPER_WIDTH_MM from thermal-receipt-layout — kept for callers. */
export const HOSPITALITY_THERMAL_PAPER_WIDTH_MM = THERMAL_PAPER_WIDTH_MM;

export function resolveGuestCheckTitle(title, check, status) {
  const explicit = String(title ?? "").trim();
  const outletType = String(
    check?.outlet?.outlet_type ?? check?.outlet?.menu_channel ?? "",
  )
    .trim()
    .toLowerCase();

  let base = "GUEST CHECK";
  if (outletType === "bar") base = "BAR CHECK";
  else if (outletType === "restaurant" || outletType === "hotel") base = "RESTAURANT CHECK";

  if (/^void$/i.test(status) || /^void order$/i.test(explicit) || /^void$/i.test(explicit)) {
    return "VOID ORDER";
  }
  if (/unpaid/i.test(explicit) || /^unpaid$/i.test(status)) return `${base} (UNPAID)`;
  if (/partial/i.test(explicit) || /partial/i.test(status)) return `${base} (PARTIAL)`;
  if (explicit && !/order receipt|paid receipt/i.test(explicit)) {
    return explicit.toUpperCase();
  }
  return base;
}

function formatServiceMode(mode) {
  const raw = String(mode ?? "").trim();
  if (!raw) return "";
  return raw
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveServedByName(check, { preparedBy = null, user = null } = {}) {
  const fromCheck =
    check?.cashier_name ||
    check?.opened_by_name ||
    check?.created_by_name ||
    check?.server_name ||
    null;
  if (fromCheck) return String(fromCheck).trim() || "—";
  if (preparedBy) return String(preparedBy).trim() || "—";
  return (
    user?.full_name ??
    user?.name ??
    user?.username ??
    user?.login ??
    "—"
  );
}

function buildCheckLineRows(lines, { showUnitPrice = true } = {}) {
  if (!lines.length) {
    return `<tr><td class="desc" colspan="${showUnitPrice ? 4 : 3}">No items</td></tr>`;
  }
  return lines
    .map((line) => {
      const desc = escapeHtml(line.description ?? line.product_code ?? "");
      const qty = Number(line.qty) || 0;
      const unit = Number(line.unit_price) || 0;
      const amount = Number(line.line_total ?? unit * qty) || 0;
      if (showUnitPrice) {
        return `<tr>
          <td class="desc">${desc}</td>
          <td class="qty">${escapeHtml(String(qty))}</td>
          <td class="price">${escapeHtml(formatThermalPrintAmount(unit))}</td>
          <td class="amount">${escapeHtml(formatThermalPrintAmount(amount))}</td>
        </tr>`;
      }
      return `<tr>
        <td class="desc">${desc}</td>
        <td class="qty">${escapeHtml(String(qty))}</td>
        <td class="amount">${escapeHtml(formatThermalPrintAmount(amount))}</td>
      </tr>`;
    })
    .join("");
}

function buildCheckTenderRows(payments, { showAllMethods = false, paid = 0, total = 0 } = {}) {
  const totals = { cash: 0, mpesa: 0, equity: 0, kcb: 0, room: 0, other: [] };
  for (const row of payments) {
    const code = String(row?.method_code ?? "").trim().toUpperCase();
    const amount = Number(row?.amount ?? 0);
    if (!(amount > 0) || !code) continue;
    if (code.includes("CASH")) totals.cash += amount;
    else if (code.includes("MPESA") || code.includes("AIRTEL")) totals.mpesa += amount;
    else if (code.includes("EQUITY")) totals.equity += amount;
    else if (code.includes("KCB")) totals.kcb += amount;
    else if (code.includes("ROOM")) totals.room += amount;
    else totals.other.push({ label: formatMethodLabel(code), value: amount });
  }

  const rows = [];
  if (showAllMethods) {
    rows.push({ label: "Cash", value: totals.cash });
    rows.push({ label: "M-Pesa", value: totals.mpesa });
    rows.push({ label: "Equity", value: totals.equity });
    rows.push({ label: "KCB", value: totals.kcb });
  } else {
    if (totals.cash > 0) rows.push({ label: "Cash", value: totals.cash });
    if (totals.mpesa > 0) rows.push({ label: "M-Pesa", value: totals.mpesa });
    if (totals.equity > 0) rows.push({ label: "Equity", value: totals.equity });
    if (totals.kcb > 0) rows.push({ label: "KCB", value: totals.kcb });
  }
  if (totals.room > 0) rows.push({ label: "Room charge", value: totals.room });
  rows.push(...totals.other);

  if (!rows.length && paid > 0) {
    rows.push({ label: "Paid", value: paid });
  } else if (!rows.length && total > 0) {
    rows.push({ label: "Amount due", value: total });
  }
  return rows;
}

function formatMethodLabel(code) {
  const c = String(code ?? "").toUpperCase();
  if (c.includes("CASH")) return "Cash";
  if (c.includes("MPESA")) return "M-Pesa";
  if (c.includes("EQUITY")) return "Equity";
  if (c.includes("KCB")) return "KCB";
  if (c.includes("ROOM")) return "Room charge";
  return c.replace(/_/g, " ");
}

function paymentDetailRow(label, value) {
  return `<tr><td class="amount-label">${escapeHtml(label)}</td><td class="amount-value">${escapeHtml(formatThermalPrintAmount(value))}</td></tr>`;
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

function buildCheckFooterHtml(documentFooterText, organizationName, context = {}) {
  const footerSettings = salesDocumentFooterSettings(
    { print_footer_receipt: documentFooterText },
    {},
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

/** Kept for callers that still import money formatting from this module. */
export function formatCheckReceiptMoney(value) {
  return formatHotelMoney(value);
}
