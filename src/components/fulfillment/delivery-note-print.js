import { openPrintWindow } from "@/lib/open-print-window";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import { formatSaleKes, saleCustomerLabel } from "@/lib/sales";
import {
  buildDocumentPrintEdgeFooterHtml,
  documentPrintEdgeFooterStyles,
} from "@/lib/document-print-edge-footer";
import {
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
  orgPrintPx,
} from "@/lib/print-typography";

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

function deliveryNotePrintStyles(generalSettings = null) {
  const px = (base, print = false) =>
    orgPrintPx(base, generalSettings, { variant: "loading_sheet", print });
  const font = orgPrintFontFamilyFromSettings(generalSettings, "loading_sheet");
  return `
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html { height: 100%; }
    body {
      font-family: ${font};
      color: #000;
      margin: 24px;
      font-size: ${px(12)};
      line-height: 1.35;
      min-height: 100%;
      ${orgPrintInkStyles(generalSettings, "loading_sheet")}
    }
    .header { text-align: center; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: ${px(20)}; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
    .header h2 { margin: 6px 0 0; font-size: ${px(16)}; font-weight: 700; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; margin: 16px 0; font-size: ${px(12)}; }
    .meta strong { display: inline-block; min-width: 110px; font-weight: 700; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: ${px(11)}; }
    th, td { border: 1px solid #000; padding: 8px 10px; vertical-align: top; }
    th { background: #f3f4f6; text-align: left; font-size: ${px(10)}; font-weight: 700; text-transform: uppercase; }
    td.num { width: 36px; text-align: center; }
    td.qty, td.price, td.total { text-align: right; white-space: nowrap; }
    tfoot td { font-weight: 700; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 36px; }
    .signatures h3 { margin: 0 0 48px; font-size: ${px(12)}; font-weight: 700; text-transform: uppercase; }
    .signatures .line { border-top: 1px solid #000; padding-top: 6px; margin-top: 40px; font-size: ${px(11)}; }
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "loading_sheet" })}
    @media print {
      body { margin: 0; font-size: ${px(12, true)}; }
      .header h1 { font-size: ${px(20, true)}; }
      .header h2 { font-size: ${px(16, true)}; }
      .meta { font-size: ${px(12, true)}; }
      table { font-size: ${px(11, true)}; }
      th { font-size: ${px(10, true)}; }
      .signatures h3 { font-size: ${px(12, true)}; }
      .signatures .line { font-size: ${px(11, true)}; }
    }
  `;
}

/**
 * Printable delivery note for a single order/stop on a trip.
 * @param {{ organizationName?: string, sale: object, trip?: object, stopNumber?: number, printedBy?: string | null, generalSettings?: object | null, documentFooterText?: string }} options
 */
export function printDeliveryNote({
  organizationName = "Delivery Note",
  sale,
  trip,
  stopNumber,
  printedBy = null,
  generalSettings = null,
  documentFooterText = "",
}) {
  const items = sale?.items ?? [];
  const routeName = trip?.route?.route_name ?? sale?.route?.route_name ?? "—";
  const customer = saleCustomerLabel(sale);
  const orderNum = sale?.order_num ?? sale?.id ?? "—";
  const balance = Math.max(0, Number(sale?.order_total || 0) - Number(sale?.amount_paid || 0));
  const printedAt = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const printedByName = resolvePrintedByUser(printedBy) ?? "—";

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
  <style>${deliveryNotePrintStyles(generalSettings)}</style>
</head>
<body class="has-doc-print-edge-footer">
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
  ${buildDocumentPrintEdgeFooterHtml({
    printedBy: printedByName,
    printedAt,
    documentFooterText,
  })}
</body>
</html>`;

  openPrintWindow(html, "width=900,height=800");
}
