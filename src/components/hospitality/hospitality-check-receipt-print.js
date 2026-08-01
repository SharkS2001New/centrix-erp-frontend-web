import { formatHotelMoney } from "@/lib/hotel-pos-settings";

/** Lightweight browser print for unpaid / paid hospitality check receipts. */
export function printHospitalityCheckReceipt(check, { title = "Order receipt" } = {}) {
  if (!check || typeof window === "undefined") return;

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
  const paid = Number(check.amount_paid) || 0;
  const total = Number(check.total) || 0;
  const balance = Number(check.balance_due ?? Math.max(0, total - paid)) || 0;

  const html = `<!doctype html>
<html><head><title>${escapeHtml(title)} ${escapeHtml(check.check_number ?? "")}</title>
<style>
  body { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; padding: 16px; color: #111; }
  h1 { font-size: 14px; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  .meta { margin: 2px 0; }
  .totals { margin-top: 12px; border-top: 1px dashed #999; padding-top: 8px; }
  .totals div { display: flex; justify-content: space-between; margin: 2px 0; }
</style></head><body>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta"><strong>${escapeHtml(check.check_number ?? "")}</strong></p>
  <p class="meta">Status: ${escapeHtml(status)}</p>
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
  <p class="meta" style="margin-top:16px">Thank you</p>
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
