import { openPrintWindow } from "@/lib/open-print-window";
import { formatSaleKes, saleCustomerLabel } from "@/lib/sales";

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
 * Printable delivery note for a single order/stop on a trip.
 * @param {{ organizationName?: string, sale: object, trip?: object, stopNumber?: number }} options
 */
export function printDeliveryNote({ organizationName = "Delivery Note", sale, trip, stopNumber }) {
  const items = sale?.items ?? [];
  const routeName = trip?.route?.route_name ?? sale?.route?.route_name ?? "—";
  const customer = saleCustomerLabel(sale);
  const orderNum = sale?.order_num ?? sale?.id ?? "—";
  const balance = Math.max(0, Number(sale?.order_total || 0) - Number(sale?.amount_paid || 0));

  const rows = items
    .map(
      (item, index) => `
      <tr>
        <td class="num">${index + 1}</td>
        <td>${escapeHtml(item.product_name ?? item.product_code)}</td>
        <td class="qty">${escapeHtml(item.quantity)}</td>
        <td class="price">${formatSaleKes(item.unit_price)}</td>
        <td class="total">${formatSaleKes(item.line_total ?? item.unit_price * item.quantity)}</td>
      </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Delivery Note — ${escapeHtml(orderNum)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 24px; font-size: 12px; }
    .header { text-align: center; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 20px; letter-spacing: 0.04em; text-transform: uppercase; }
    .header h2 { margin: 6px 0 0; font-size: 16px; font-weight: 700; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 16px 0; font-size: 12px; }
    .meta strong { display: inline-block; min-width: 110px; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border: 1px solid #333; padding: 8px 10px; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; font-size: 11px; text-transform: uppercase; }
    td.num { width: 36px; text-align: center; }
    td.qty, td.price, td.total { text-align: right; white-space: nowrap; }
    tfoot td { font-weight: 700; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 36px; }
    .signatures h3 { margin: 0 0 48px; font-size: 12px; text-transform: uppercase; }
    .signatures .line { border-top: 1px solid #333; padding-top: 6px; margin-top: 40px; font-size: 11px; }
    @media print { body { margin: 12mm; } }
  </style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(organizationName)}</h1>
    <h2>Delivery Note</h2>
  </div>
  <div class="meta">
    <div><strong>Order #:</strong> ${escapeHtml(orderNum)}</div>
    <div><strong>Date:</strong> ${escapeHtml(formatDisplayDate(trip?.scheduled_date ?? sale?.created_at?.slice?.(0, 10)))}</div>
    <div><strong>Customer:</strong> ${escapeHtml(customer)}</div>
    <div><strong>Route:</strong> ${escapeHtml(routeName)}</div>
    <div><strong>Trip:</strong> ${escapeHtml(trip?.trip_code ?? "—")}</div>
    <div><strong>Stop:</strong> ${stopNumber != null ? escapeHtml(stopNumber) : "—"}</div>
    <div><strong>Driver:</strong> ${escapeHtml(trip?.driver?.full_name ?? "—")}</div>
    <div><strong>Vehicle:</strong> ${escapeHtml(trip?.vehicle?.plate_number ?? trip?.vehicle?.vehicle_name ?? "—")}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>No.</th>
        <th>Product</th>
        <th>Qty</th>
        <th>Unit price</th>
        <th>Line total</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5" style="text-align:center;padding:24px;">No line items</td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" style="text-align:right;">Order total</td>
        <td class="total">${formatSaleKes(sale?.order_total)}</td>
      </tr>
      <tr>
        <td colspan="4" style="text-align:right;">Amount paid</td>
        <td class="total">${formatSaleKes(sale?.amount_paid)}</td>
      </tr>
      <tr>
        <td colspan="4" style="text-align:right;">Balance due (COD)</td>
        <td class="total">${formatSaleKes(balance)}</td>
      </tr>
    </tfoot>
  </table>
  <div class="signatures">
    <div>
      <h3>Delivered by</h3>
      <div class="line">Signature: _________________________</div>
      <div class="line">Name: _________________________</div>
      <div class="line">Date: _________________________</div>
    </div>
    <div>
      <h3>Received by</h3>
      <div class="line">Signature: _________________________</div>
      <div class="line">Name: _________________________</div>
      <div class="line">Date: _________________________</div>
    </div>
  </div>
</body>
</html>`;

  openPrintWindow(html, "width=900,height=800");
}
