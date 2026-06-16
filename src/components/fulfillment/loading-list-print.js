import { openPrintWindow } from "@/lib/open-print-window";

function formatKes(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-KE", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ organizationName?: string, loadingList: object, trip?: object }} options
 */
export function printLoadingList({ organizationName = "Loading List", loadingList, trip }) {
  const lines = loadingList?.lines ?? [];
  const routeName = loadingList?.route?.route_name ?? trip?.route?.route_name ?? "—";
  const listDate = loadingList?.list_date ?? trip?.scheduled_date;
  const preparedBy = loadingList?.prepared_by_name ?? trip?.prepared_by_name ?? "";
  const checkedBy = loadingList?.checked_by_name ?? trip?.checked_by_name ?? "";
  const total = loadingList?.total_amount ?? lines.reduce((sum, l) => sum + Number(l.line_total || 0), 0);

  const rows = lines
    .map(
      (line) => `
      <tr>
        <td class="num">${line.line_no}</td>
        <td class="product">
          <strong>${escapeHtml(line.product_name)}</strong>
          ${line.pack_breakdown ? `<div class="sub">${escapeHtml(line.pack_breakdown)}</div>` : ""}
        </td>
        <td class="qty">
          <strong>${escapeHtml(line.quantity_label || line.quantity)}</strong>
          ${line.pack_breakdown ? `<div class="sub">(${escapeHtml(line.pack_breakdown)})</div>` : ""}
        </td>
        <td class="price">${formatKes(line.unit_price)}<div class="sub">Per ${escapeHtml((line.quantity_label || "").split(" ").slice(-1)[0] || "unit")}</div></td>
        <td class="total">${formatKes(line.line_total)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Loading List — ${escapeHtml(routeName)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; font-size: 12px; }
    .header { text-align: center; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 20px; letter-spacing: 0.04em; text-transform: uppercase; }
    .header h2 { margin: 6px 0 0; font-size: 16px; font-weight: 700; letter-spacing: 0.08em; }
    .meta { display: flex; justify-content: space-between; margin: 16px 0 12px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #333; padding: 8px 10px; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; font-size: 11px; text-transform: uppercase; }
    td.num { width: 36px; text-align: center; }
    td.qty, td.price, td.total { text-align: right; white-space: nowrap; }
    td.product { width: 34%; }
    .sub { color: #555; font-size: 10px; margin-top: 3px; }
    tfoot td { font-weight: 700; font-size: 13px; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 36px; }
    .signatures h3 { margin: 0 0 48px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.06em; }
    .signatures .line { border-top: 1px solid #333; padding-top: 6px; margin-top: 40px; font-size: 11px; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(organizationName)}</h1>
    <h2>Loading List</h2>
  </div>
  <div class="meta">
    <div><strong>Date:</strong> ${escapeHtml(formatDisplayDate(listDate))}</div>
    <div><strong>Route:</strong> ${escapeHtml(routeName)}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>No.</th>
        <th>Product Name</th>
        <th>Total Items<br/>(Breakdown in Packages)</th>
        <th>Price (R/W)</th>
        <th>Line Total</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5" style="text-align:center;padding:24px;">No line items</td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" style="text-align:right;">TOTAL</td>
        <td class="total">${formatKes(total)}</td>
      </tr>
    </tfoot>
  </table>
  <div class="signatures">
    <div>
      <h3>Prepared By</h3>
      <div class="line">Signature: _________________________</div>
      <div class="line">Name: ${escapeHtml(preparedBy || "_________________________")}</div>
      <div class="line">Date: _________________________</div>
    </div>
    <div>
      <h3>Checked By</h3>
      <div class="line">Signature: _________________________</div>
      <div class="line">Name: ${escapeHtml(checkedBy || "_________________________")}</div>
      <div class="line">Date: _________________________</div>
    </div>
  </div>
</body>
</html>`;

  openPrintWindow(html, "width=900,height=800");
}
