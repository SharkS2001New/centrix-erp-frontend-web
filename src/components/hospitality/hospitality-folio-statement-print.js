import { DEFAULT_PRINT_ORG_NAME } from "@/lib/branding";
import { formatThermalReceiptDateTime } from "@/lib/datetime";
import { formatHotelMoney } from "@/lib/hotel-pos-settings";
import { RECEIPT_POWERED_BY_LINE } from "@/lib/print-footer-settings";
import { dispatchPrintJob } from "@/lib/print-dispatch";
import {
  createOrgPrintPx,
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
} from "@/lib/print-typography";
import {
  buildSaleDocumentOrgHeaderHtml,
  escapeHtml,
  resolveSaleDocumentBranding,
} from "@/lib/sale-document-print-shared";

function money(v) {
  return formatHotelMoney(Number(v) || 0);
}

function methodLabel(code) {
  const c = String(code ?? "").toUpperCase();
  if (c === "DEPOSIT") return "Deposit";
  if (c === "REFUND") return "Refund";
  if (c.includes("CASH")) return "Cash";
  if (c.includes("MPESA")) return "M-Pesa";
  if (c.includes("EQUITY")) return "Equity";
  if (c.includes("KCB")) return "KCB";
  if (c.includes("CHEQUE")) return "Cheque";
  return c.replace(/_/g, " ") || "—";
}

/**
 * A4 guest folio statement HTML (charges, payments, balance).
 * @param {object} folio
 * @param {object} [options]
 */
export function buildHospitalityFolioStatementHtml(folio, options = {}) {
  if (!folio) return null;
  const {
    organization = null,
    printSettings = null,
    generalSettings = null,
    branding = null,
    user = null,
  } = options;

  const resolved = resolveSaleDocumentBranding({
    organization,
    printSettings,
    generalSettings,
    branding,
  });
  const orgName = resolved.organizationName || DEFAULT_PRINT_ORG_NAME;
  const fontFamily = orgPrintFontFamilyFromSettings(printSettings);
  const ink = orgPrintInkStyles(printSettings);
  const px = createOrgPrintPx(printSettings);

  const charges = Array.isArray(folio.charges) ? folio.charges : [];
  const payments = Array.isArray(folio.payments) ? folio.payments : [];
  const chargeTotal = charges.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const paymentTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = Number(folio.balance ?? chargeTotal - paymentTotal);

  const chargeRows = charges.length
    ? charges
        .map(
          (c) => `<tr>
            <td>${escapeHtml(c.description || c.charge_type || "Charge")}</td>
            <td class="muted">${escapeHtml(String(c.charge_type || ""))}</td>
            <td class="num">${escapeHtml(money(c.amount))}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">No charges</td></tr>`;

  const paymentRows = payments.length
    ? payments
        .map(
          (p) => `<tr>
            <td>${escapeHtml(methodLabel(p.method_code))}</td>
            <td class="muted">${escapeHtml(p.reference || "")}</td>
            <td class="num">${escapeHtml(money(p.amount))}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="muted">No payments</td></tr>`;

  const header = buildSaleDocumentOrgHeaderHtml(resolved, {
    documentTitle: "Guest folio statement",
    layout: "a4",
  });

  const printedAt = formatThermalReceiptDateTime(new Date());
  const cashier =
    user?.name || user?.full_name || user?.username || user?.login || "—";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Folio ${escapeHtml(folio.folio_number || "")}</title>
  <style>
    body { margin: 0; padding: 24px; color: ${ink.body}; font-family: ${fontFamily}; font-size: ${px(12)}px; }
    h1 { font-size: ${px(18)}px; margin: 0 0 8px; }
    .meta { margin: 12px 0 20px; font-size: ${px(12)}px; }
    .meta strong { display: inline-block; min-width: 88px; }
    table { width: 100%; border-collapse: collapse; margin: 8px 0 16px; }
    th, td { border-bottom: 1px solid #ddd; padding: 6px 4px; text-align: left; vertical-align: top; }
    th { font-size: ${px(11)}px; text-transform: uppercase; letter-spacing: 0.04em; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .muted { color: #666; }
    .totals { margin-top: 8px; width: 280px; margin-left: auto; }
    .totals td { border: none; padding: 4px; }
    .grand { font-weight: 700; font-size: ${px(14)}px; }
    .footer { margin-top: 28px; font-size: ${px(10)}px; color: #666; text-align: center; }
  </style>
</head>
<body>
  ${header}
  <h1>Guest folio statement</h1>
  <div class="meta">
    <div><strong>Folio</strong> ${escapeHtml(folio.folio_number || "—")}</div>
    <div><strong>Guest</strong> ${escapeHtml(folio.guest_name || "—")}</div>
    <div><strong>Room</strong> ${escapeHtml(folio.room_number || "—")}</div>
    <div><strong>Status</strong> ${escapeHtml(String(folio.status || "").replace(/_/g, " "))}</div>
    <div><strong>Check-in</strong> ${escapeHtml(folio.checked_in_at ? formatThermalReceiptDateTime(folio.checked_in_at) : "—")}</div>
  </div>

  <h2 style="font-size:${px(13)}px;margin:0 0 4px;">Charges</h2>
  <table>
    <thead><tr><th>Description</th><th>Type</th><th class="num">Amount</th></tr></thead>
    <tbody>${chargeRows}</tbody>
  </table>

  <h2 style="font-size:${px(13)}px;margin:0 0 4px;">Payments</h2>
  <table>
    <thead><tr><th>Method</th><th>Reference</th><th class="num">Amount</th></tr></thead>
    <tbody>${paymentRows}</tbody>
  </table>

  <table class="totals">
    <tr><td>Charges</td><td class="num">${escapeHtml(money(chargeTotal))}</td></tr>
    <tr><td>Payments</td><td class="num">${escapeHtml(money(paymentTotal))}</td></tr>
    <tr class="grand"><td>Balance due</td><td class="num">${escapeHtml(money(balance))}</td></tr>
  </table>

  <div class="footer">
    Printed ${escapeHtml(printedAt)} · ${escapeHtml(cashier)} · ${escapeHtml(orgName)}
    <div>${escapeHtml(RECEIPT_POWERED_BY_LINE)}</div>
  </div>
</body>
</html>`;
}

export async function printHospitalityFolioStatement(folio, options = {}) {
  const html = buildHospitalityFolioStatementHtml(folio, options);
  if (!html) return null;
  return dispatchPrintJob({
    jobType: "invoice",
    title: `Folio ${folio?.folio_number || ""}`.trim(),
    html,
    ...options.dispatch,
  });
}
