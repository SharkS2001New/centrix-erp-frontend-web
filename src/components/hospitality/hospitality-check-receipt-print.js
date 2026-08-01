import { formatHotelMoney } from "@/lib/hotel-pos-settings";

/**
 * Browser print for unpaid / paid hospitality check receipts.
 * Uses hospitality print settings (independent from retail sales receipts).
 *
 * @param {object} check
 * @param {{
 *   title?: string,
 *   organization?: { org_name?: string, primary_tel?: string, secondary_tel?: string } | null,
 *   printSettings?: {
 *     check_receipt_copies?: number,
 *     show_outlet_on_check_receipt?: boolean,
 *     show_organization_on_check_receipt?: boolean,
 *     check_receipt_footer?: string,
 *     use_same_print_phones_for_check?: boolean,
 *     check_print_phones?: { tel1?: string, tel2?: string },
 *   } | null,
 * }} [options]
 */
export function printHospitalityCheckReceipt(check, options = {}) {
  if (!check || typeof window === "undefined") return;

  const {
    title = "Order receipt",
    organization = null,
    printSettings = null,
  } = options;

  const copies = Math.min(3, Math.max(1, Number(printSettings?.check_receipt_copies) || 1));
  const showOrg = printSettings?.show_organization_on_check_receipt !== false;
  const showOutlet = printSettings?.show_outlet_on_check_receipt !== false;
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
  const phoneLine = [phones.tel1, phones.tel2].map((p) => String(p ?? "").trim()).filter(Boolean).join(" · ");

  const lines = Array.isArray(check.lines) ? check.lines : [];
  const rows = lines
    .map(
      (line) =>
        `<tr>
          <td style="padding:4px 0;text-align:left">${escapeHtml(line.description ?? line.product_code ?? "")}</td>
          <td style="padding:4px 0;text-align:center">${Number(line.qty) || 0}</td>
          <td style="padding:4px 0;text-align:right">${formatHotelMoney(line.line_total)}</td>
        </tr>`,
    )
    .join("");

  const status = String(check.status ?? "").replace(/_/g, " ");
  const tableLabel = check.floor_table?.label || check.floor_table?.code || "";
  const outletLabel = check.outlet?.name || check.outlet?.code || "";
  const paid = Number(check.amount_paid) || 0;
  const total = Number(check.total) || 0;
  const balance = Number(check.balance_due ?? Math.max(0, total - paid)) || 0;
  const orgName = String(organization?.org_name ?? "").trim();

  const singleBody = `
  ${showOrg && orgName ? `<p class="meta org">${escapeHtml(orgName)}</p>` : ""}
  ${phoneLine ? `<p class="meta">${escapeHtml(phoneLine)}</p>` : ""}
  <h1>${escapeHtml(title)}</h1>
  <p class="meta"><strong>${escapeHtml(check.check_number ?? "")}</strong></p>
  <p class="meta">Status: ${escapeHtml(status)}</p>
  ${showOutlet && outletLabel ? `<p class="meta">Outlet: ${escapeHtml(outletLabel)}</p>` : ""}
  ${tableLabel ? `<p class="meta">Table: ${escapeHtml(tableLabel)}</p>` : ""}
  <table>
    <thead><tr><th align="left">Item</th><th>Qty</th><th align="right">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div><span>Total</span><span>${formatHotelMoney(total)}</span></div>
    <div><span>Paid</span><span>${formatHotelMoney(paid)}</span></div>
    <div><span>Balance</span><span>${formatHotelMoney(balance)}</span></div>
  </div>
  <p class="meta footer">${escapeHtml(footer)}</p>`;

  const pages = Array.from({ length: copies }, (_, i) =>
    `<section class="copy">${singleBody}${
      copies > 1 ? `<p class="meta copy-label">Copy ${i + 1} of ${copies}</p>` : ""
    }</section>`,
  ).join('<div class="page-break"></div>');

  const html = `<!doctype html>
<html><head><title>${escapeHtml(title)} ${escapeHtml(check.check_number ?? "")}</title>
<style>
  body { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; padding: 16px; color: #111; }
  h1 { font-size: 14px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  .meta { margin: 2px 0; }
  .org { font-weight: 700; font-size: 13px; }
  .footer { margin-top: 16px; white-space: pre-wrap; }
  .copy-label { margin-top: 8px; font-size: 10px; color: #666; }
  .totals { margin-top: 12px; border-top: 1px dashed #999; padding-top: 8px; }
  .totals div { display: flex; justify-content: space-between; margin: 2px 0; }
  .page-break { page-break-after: always; height: 0; }
</style></head><body>
  ${pages}
  <script>window.onload = function () { window.print(); setTimeout(function () { window.close(); }, 300); };</script>
</body></html>`;

  const win = window.open("", "_blank", "noopener,noreferrer,width=420,height=640");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
