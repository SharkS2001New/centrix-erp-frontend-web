import { formatHotelMoney } from "@/lib/hotel-pos-settings";
import { dispatchPrintJob } from "@/lib/print-dispatch";
import {
  THERMAL_CONTENT_WIDTH_MM,
  THERMAL_PAPER_WIDTH_MM,
  THERMAL_SIDE_MARGIN_MM,
} from "@/lib/thermal-receipt-layout";

/**
 * Build 80mm thermal HTML for a hospitality check (Hotel POS).
 * Printed via Centrix Print Agent when enabled, otherwise the browser dialog.
 *
 * @param {object} check
 * @param {{
 *   title?: string,
 *   organization?: { org_name?: string, primary_tel?: string, secondary_tel?: string } | null,
 *   printSettings?: {
 *     check_receipt_copies?: number,
 *     show_outlet_on_check_receipt?: boolean,
 *     show_organization_on_check_receipt?: boolean,
 *     enable_check_guest_name?: boolean,
 *     check_receipt_footer?: string,
 *     use_same_print_phones_for_check?: boolean,
 *     check_print_phones?: { tel1?: string, tel2?: string },
 *   } | null,
 * }} [options]
 * @returns {string|null}
 */
export function buildHospitalityCheckReceiptHtml(check, options = {}) {
  if (!check) return null;

  const {
    title = "Order receipt",
    organization = null,
    printSettings = null,
  } = options;

  const showOrg = printSettings?.show_organization_on_check_receipt !== false;
  const showOutlet = printSettings?.show_outlet_on_check_receipt !== false;
  const showGuestName = printSettings?.enable_check_guest_name === true;
  const footer = String(printSettings?.check_receipt_footer ?? "Thank you").trim() || "Thank you";
  const useSamePhones = printSettings?.use_same_print_phones_for_check !== false;
  const phones = useSamePhones
    ? {
        tel1: organization?.primary_tel ?? "",
        tel2: organization?.secondary_tel ?? "",
      }
    : {
        tel1: printSettings?.check_print_phones?.tel1 ?? "",
        tel2: printSettings?.check_print_phones?.tel2 ?? "",
      };
  const phoneLine = [phones.tel1, phones.tel2]
    .map((p) => String(p ?? "").trim())
    .filter(Boolean)
    .join(" · ");

  const lines = Array.isArray(check.lines) ? check.lines : [];
  const rows = lines
    .map(
      (line) =>
        `<tr>
          <td class="item">${escapeHtml(line.description ?? line.product_code ?? "")}</td>
          <td class="qty">${Number(line.qty) || 0}</td>
          <td class="amt">${escapeHtml(formatHotelMoney(line.line_total))}</td>
        </tr>`,
    )
    .join("");

  const status = String(check.status ?? "").replace(/_/g, " ");
  const tableLabel = check.floor_table?.label || check.floor_table?.code || "";
  const outletLabel = check.outlet?.name || check.outlet?.code || "";
  const guestName = String(check.guest_name ?? "").trim();
  const paid = Number(check.amount_paid) || 0;
  const total = Number(check.total) || 0;
  const vat = Number(check.vat_total) || 0;
  const balance = Number(check.balance_due ?? Math.max(0, total - paid)) || 0;
  const orgName = String(organization?.org_name ?? "").trim();
  const checkNumber = String(check.check_number ?? "").trim();

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}${checkNumber ? ` ${escapeHtml(checkNumber)}` : ""}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: ui-monospace, Menlo, Consolas, "Courier New", monospace;
      font-size: 12px;
      color: #000;
      background: #fff;
      margin: 0;
      padding: 0;
    }
    .receipt {
      width: ${THERMAL_CONTENT_WIDTH_MM}mm;
      max-width: ${THERMAL_CONTENT_WIDTH_MM}mm;
      margin: 0 auto;
      padding: 2mm ${THERMAL_SIDE_MARGIN_MM}mm 4mm;
    }
    h1 {
      font-size: 13px;
      margin: 6px 0 4px;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .org {
      font-weight: 700;
      font-size: 13px;
      text-align: center;
      margin: 0 0 2px;
    }
    .meta {
      margin: 1px 0;
      text-align: center;
      font-size: 11px;
    }
    .meta-left { text-align: left; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 8px;
      table-layout: fixed;
    }
    th, td {
      padding: 2px 0;
      vertical-align: top;
      font-size: 11px;
    }
    th { border-bottom: 1px dashed #000; font-weight: 700; }
    th.item, td.item { text-align: left; width: 52%; word-break: break-word; }
    th.qty, td.qty { text-align: center; width: 16%; }
    th.amt, td.amt { text-align: right; width: 32%; }
    .divider {
      border-top: 1px dashed #000;
      margin: 6px 0;
    }
    .totals div {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
      font-size: 12px;
    }
    .totals .grand {
      font-weight: 700;
      font-size: 13px;
      margin-top: 4px;
    }
    .footer {
      margin-top: 10px;
      text-align: center;
      white-space: pre-wrap;
      font-size: 11px;
    }
  </style>
</head>
<body class="centrix-print-thermal">
  <div class="receipt">
    ${showOrg && orgName ? `<p class="org">${escapeHtml(orgName)}</p>` : ""}
    ${phoneLine ? `<p class="meta">${escapeHtml(phoneLine)}</p>` : ""}
    <h1>${escapeHtml(title)}</h1>
    ${checkNumber ? `<p class="meta"><strong>${escapeHtml(checkNumber)}</strong></p>` : ""}
    <p class="meta meta-left">Status: ${escapeHtml(status)}</p>
    ${showOutlet && outletLabel ? `<p class="meta meta-left">Outlet: ${escapeHtml(outletLabel)}</p>` : ""}
    ${tableLabel ? `<p class="meta meta-left">Table: ${escapeHtml(tableLabel)}</p>` : ""}
    ${showGuestName && guestName ? `<p class="meta meta-left">Guest: ${escapeHtml(guestName)}</p>` : ""}
    <table>
      <thead>
        <tr>
          <th class="item">Item</th>
          <th class="qty">Qty</th>
          <th class="amt">Amount</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td class="item" colspan="3">No lines</td></tr>`}</tbody>
    </table>
    <div class="divider"></div>
    <div class="totals">
      ${vat > 0 ? `<div><span>VAT</span><span>${escapeHtml(formatHotelMoney(vat))}</span></div>` : ""}
      <div class="grand"><span>Total</span><span>${escapeHtml(formatHotelMoney(total))}</span></div>
      <div><span>Paid</span><span>${escapeHtml(formatHotelMoney(paid))}</span></div>
      <div><span>Balance</span><span>${escapeHtml(formatHotelMoney(balance))}</span></div>
    </div>
    <p class="footer">${escapeHtml(footer)}</p>
  </div>
</body>
</html>`;
}

/**
 * Print a hospitality check receipt via Centrix Print Agent (thermal) or browser fallback.
 *
 * @returns {Promise<{ mode: "agent" | "browser", ok: boolean, printer?: string, jobId?: string } | null>}
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
  });
}

/** @deprecated Prefer THERMAL_PAPER_WIDTH_MM from thermal-receipt-layout — kept for callers. */
export const HOSPITALITY_THERMAL_PAPER_WIDTH_MM = THERMAL_PAPER_WIDTH_MM;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
