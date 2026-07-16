import { openPrintWindow } from "@/lib/open-print-window";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import {
  buildReportOrgHeaderHtml,
  resolveReportBranding,
} from "@/lib/reports/report-branding";
import { formatPrintDisplayDate } from "@/lib/print-dates";
import {
  buildDocumentPrintEdgeFooterHtml,
  documentPrintEdgeFooterStyles,
} from "@/lib/document-print-edge-footer";
import { documentFooterHtmlFromText } from "@/lib/footer-line-format";
import {
  createOrgPrintPx,
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
} from "@/lib/print-typography";
import { saleCustomerLabel } from "@/lib/sales";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatKes(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function resolveTripMeta({ trip, loadingList }) {
  const routeNames =
    (Array.isArray(trip?.route_names) && trip.route_names.length
      ? trip.route_names.join(" · ")
      : null) ??
    trip?.route?.route_name ??
    (Array.isArray(loadingList?.trip?.route_names) && loadingList.trip.route_names.length
      ? loadingList.trip.route_names.join(" · ")
      : null) ??
    loadingList?.route?.route_name ??
    "—";

  const tripCode = trip?.trip_code ?? loadingList?.trip?.trip_code ?? null;
  const vehicle =
    trip?.vehicle?.plate_number ??
    trip?.vehicle?.vehicle_name ??
    loadingList?.trip?.vehicle?.plate_number ??
    null;
  const driver = trip?.driver?.full_name ?? loadingList?.trip?.driver?.full_name ?? null;
  const scheduledDate = trip?.scheduled_date ?? loadingList?.trip?.scheduled_date ?? null;

  return { routeNames, tripCode, vehicle, driver, scheduledDate };
}

/**
 * One row per customer (orders on the same stop customer are summed).
 * @param {{ sales?: object[], orders?: object[] }} input
 */
export function buildTripChartCustomerRows({ sales, orders } = {}) {
  /** @type {Map<string, { stop: number, customer_name: string, order_total: number, order_count: number }>} */
  const byCustomer = new Map();

  if (Array.isArray(orders) && orders.length > 0) {
    for (const order of orders) {
      const name = String(order.customer_name ?? "").trim() || "Walk-in";
      const key = order.customer_num != null && order.customer_num !== ""
        ? `num:${order.customer_num}`
        : `name:${name.toLowerCase()}`;
      const stop = Number(order.stop_no) || 9999;
      const amount = Number(order.order_total ?? order.subtotal) || 0;
      const existing = byCustomer.get(key);
      if (existing) {
        existing.order_total += amount;
        existing.order_count += 1;
        existing.stop = Math.min(existing.stop, stop);
      } else {
        byCustomer.set(key, {
          stop,
          customer_name: name,
          order_total: amount,
          order_count: 1,
        });
      }
    }
  } else if (Array.isArray(sales)) {
    const sorted = [...sales].sort(
      (a, b) => (a.pivot?.stop_seq ?? 0) - (b.pivot?.stop_seq ?? 0),
    );
    sorted.forEach((sale, index) => {
      const name = saleCustomerLabel(sale);
      const key = sale.customer_num != null && sale.customer_num !== ""
        ? `num:${sale.customer_num}`
        : `name:${name.toLowerCase()}`;
      const stop = Number(sale.pivot?.stop_seq) || index + 1;
      const amount = Number(sale.order_total) || 0;
      const existing = byCustomer.get(key);
      if (existing) {
        existing.order_total += amount;
        existing.order_count += 1;
        existing.stop = Math.min(existing.stop, stop);
      } else {
        byCustomer.set(key, {
          stop,
          customer_name: name,
          order_total: amount,
          order_count: 1,
        });
      }
    });
  }

  return [...byCustomer.values()]
    .sort((a, b) => a.stop - b.stop || a.customer_name.localeCompare(b.customer_name))
    .map((row, index) => ({
      ...row,
      line_no: index + 1,
      order_total: Math.round(row.order_total * 100) / 100,
    }));
}

function tripChartListPrintStyles(generalSettings) {
  const printPx = createOrgPrintPx(generalSettings, "loading_sheet");
  const px = printPx.body;
  const fontFamily = orgPrintFontFamilyFromSettings(generalSettings, "loading_sheet");

  return `
    ${orgPrintInkStyles(generalSettings, "loading_sheet")}
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "loading_sheet" })}
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ${fontFamily}; color: #0f172a; font-size: ${px(12)}; }
    .page { padding: ${px(24)}; }
    .org-header { text-align: center; margin-bottom: ${px(12)}; }
    .org-logo { max-height: ${px(48)}; margin-bottom: ${px(6)}; }
    .org-name { font-size: ${px(16)}; font-weight: 700; letter-spacing: 0.04em; }
    .title-block { text-align: center; margin-bottom: ${px(16)}; }
    .doc-title { font-size: ${px(15)}; font-weight: 700; margin: 0 0 ${px(4)}; }
    .meta-line { font-size: ${px(11)}; margin: ${px(2)} 0; color: #334155; }
    table { width: 100%; border-collapse: collapse; margin-top: ${px(8)}; }
    th, td { border: 1px solid #cbd5e1; padding: ${px(6)} ${px(8)}; font-size: ${px(11)}; vertical-align: top; }
    th { background: #f1f5f9; text-align: left; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; font-size: ${px(10)}; }
    .col-no { width: 8%; text-align: center; }
    .col-customer { width: 62%; }
    .col-total { width: 30%; text-align: right; white-space: nowrap; }
    td.col-total { font-variant-numeric: tabular-nums; font-weight: 600; }
    .summary-box {
      margin-top: ${px(14)};
      border: 1px solid #94a3b8;
      border-radius: ${px(6)};
      padding: ${px(10)} ${px(12)};
      background: #f8fafc;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      gap: ${px(16)};
      font-size: ${px(12)};
      padding: ${px(3)} 0;
    }
    .summary-row.strong { font-weight: 700; font-size: ${px(13)}; border-top: 1px solid #cbd5e1; margin-top: ${px(4)}; padding-top: ${px(8)}; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: ${px(24)};
      margin-top: ${px(28)};
    }
    .signatures h3 { font-size: ${px(11)}; margin: 0 0 ${px(10)}; text-transform: uppercase; letter-spacing: 0.04em; }
    .signatures .line { font-size: ${px(11)}; margin: ${px(10)} 0; }
    .doc-footer { margin-top: ${px(20)}; font-size: ${px(10)}; color: #64748b; }
    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: ${px(12, true)}; }
      .page { padding: ${px(12, true)}; }
    }
  `;
}

export function buildTripChartListHtml({
  organization = null,
  generalSettings = null,
  organizationName = "Trip Chart List",
  trip = null,
  loadingList = null,
  sales = null,
  orders = null,
  financialSummary = null,
  documentFooterText = null,
  printedBy = null,
} = {}) {
  const branding = resolveReportBranding({
    organization,
    generalSettings,
    organizationNameFallback: organizationName,
  });
  const meta = resolveTripMeta({ trip, loadingList });
  const rows = buildTripChartCustomerRows({
    sales: sales ?? trip?.sales,
    orders: orders ?? loadingList?.orders,
  });
  const customerCount = rows.length;
  const orderCount =
    financialSummary?.order_count ??
    (Array.isArray(orders) ? orders.length : null) ??
    (Array.isArray(sales) ? sales.length : null) ??
    rows.reduce((sum, row) => sum + (row.order_count || 1), 0);
  const grandTotal =
    Number(financialSummary?.total_amount) ||
    rows.reduce((sum, row) => sum + (Number(row.order_total) || 0), 0);

  const rowHtml =
    rows.length > 0
      ? rows
          .map(
            (row) => `
      <tr>
        <td class="col-no">${row.line_no}</td>
        <td class="col-customer">${escapeHtml(row.customer_name)}</td>
        <td class="col-total">KES ${formatKes(row.order_total)}</td>
      </tr>`,
          )
          .join("")
      : `<tr><td colspan="3" style="text-align:center;color:#64748b;padding:16px;">No delivery stops on this trip chart.</td></tr>`;

  const printedByName = resolvePrintedByUser(printedBy);
  const printedAt = formatPrintDisplayDate(new Date());
  const footerBody = documentFooterHtmlFromText(documentFooterText);
  const footerHtml = footerBody ? `<div class="doc-footer">${footerBody}</div>` : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Trip Chart List${meta.tripCode ? ` — ${escapeHtml(meta.tripCode)}` : ""}</title>
  <style>${tripChartListPrintStyles(generalSettings)}</style>
</head>
<body>
  <div class="page">
    ${buildReportOrgHeaderHtml(branding)}
    <div class="title-block">
      <p class="doc-title">TRIP CHART LIST</p>
      ${meta.tripCode ? `<p class="meta-line">Trip Chart No: ${escapeHtml(meta.tripCode)}</p>` : ""}
      <p class="meta-line">Route: ${escapeHtml(meta.routeNames)}</p>
      ${meta.scheduledDate ? `<p class="meta-line">Date: ${escapeHtml(formatPrintDisplayDate(meta.scheduledDate))}</p>` : ""}
      ${meta.vehicle ? `<p class="meta-line">Vehicle: ${escapeHtml(meta.vehicle)}</p>` : ""}
      ${meta.driver ? `<p class="meta-line">Driver: ${escapeHtml(meta.driver)}</p>` : ""}
    </div>
    <table>
      <thead>
        <tr>
          <th class="col-no">No.</th>
          <th class="col-customer">Customer Name</th>
          <th class="col-total">Order Total</th>
        </tr>
      </thead>
      <tbody>${rowHtml}</tbody>
    </table>
    <div class="summary-box">
      <div class="summary-row"><span>Customers delivering to</span><strong>${customerCount}</strong></div>
      <div class="summary-row"><span>Orders on trip</span><strong>${orderCount}</strong></div>
      <div class="summary-row strong"><span>Total amount vehicle is carrying</span><strong>KES ${formatKes(grandTotal)}</strong></div>
    </div>
    <div class="signatures">
      <div>
        <h3>Driver</h3>
        <div class="line">Signature: _________________________</div>
        <div class="line">Name: ${escapeHtml(meta.driver || "_________________________")}</div>
        <div class="line">Date: _________________________</div>
      </div>
      <div>
        <h3>Checked by</h3>
        <div class="line">Signature: _________________________</div>
        <div class="line">Name: _________________________</div>
        <div class="line">Date: _________________________</div>
      </div>
    </div>
    ${footerHtml}
  </div>
  ${buildDocumentPrintEdgeFooterHtml({
    printedBy: printedByName,
    printedAt,
  })}
</body>
</html>`;
}

export function printTripChartList(options = {}) {
  const html = buildTripChartListHtml(options);
  openPrintWindow(html, "width=900,height=800");
}
