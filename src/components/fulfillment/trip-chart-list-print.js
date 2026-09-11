import { printHtmlDocument } from "@/lib/print-dispatch";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import {
  buildReportOrgHeaderHtml,
  resolveReportBranding,
} from "@/lib/reports/report-branding";
import { brandingWithDocumentLogo } from "@/lib/document-logo-settings";
import { formatPrintDisplayDate } from "@/lib/print-dates";
import {
  buildDocumentPrintEdgeFooterHtml,
  DOCUMENT_PRINT_EDGE_BODY_BOTTOM,
  DOCUMENT_PRINT_EDGE_BODY_SIDES,
  DOCUMENT_PRINT_EDGE_BODY_TOP,
  documentPrintEdgeFooterStyles,
} from "@/lib/document-print-edge-footer";
import { documentFooterHtmlFromText } from "@/lib/footer-line-format";
import {
  createOrgPrintPx,
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
} from "@/lib/print-typography";
import { saleCustomerLabel } from "@/lib/sales";
import { orgDocumentTemplateCss } from "@/lib/document-print-templates";
import { formatTonnage, loadTonnageFromDocuments } from "@/lib/load-weight";
import { isLoadTonnageEnabled } from "@/lib/loading-sheet-print-settings";

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

function resolveTripMeta({ trip, loadingList, pickingList } = {}) {
  const routeNames =
    (Array.isArray(trip?.route_names) && trip.route_names.length
      ? trip.route_names.join(" · ")
      : null) ??
    trip?.route?.route_name ??
    (Array.isArray(loadingList?.trip?.route_names) && loadingList.trip.route_names.length
      ? loadingList.trip.route_names.join(" · ")
      : null) ??
    loadingList?.route?.route_name ??
    pickingList?.route?.route_name ??
    "—";

  const tripCode = trip?.trip_code ?? loadingList?.trip?.trip_code ?? pickingList?.list_number ?? null;
  const vehicle =
    trip?.vehicle?.plate_number ??
    trip?.vehicle?.vehicle_name ??
    loadingList?.trip?.vehicle?.plate_number ??
    loadingList?.vehicle?.plate_number ??
    loadingList?.vehicle?.vehicle_name ??
    pickingList?.vehicle?.plate_number ??
    pickingList?.vehicle?.vehicle_name ??
    null;
  const driver =
    trip?.driver?.full_name ??
    loadingList?.trip?.driver?.full_name ??
    loadingList?.driver?.full_name ??
    pickingList?.driver?.full_name ??
    null;
  const scheduledDate =
    trip?.scheduled_date ?? loadingList?.trip?.scheduled_date ?? loadingList?.list_date ?? pickingList?.list_date ?? null;

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

/**
 * A4 line-area budgets (mm) — same approach as picking list.
 * Explicit chunking + CSS grid rows (not <table>/<tr>): Chromium still clips
 * table rows at the page edge even with page-break-inside:avoid (row #36 vanished).
 */
export const TRIP_CHART_PAGE_BUDGET_MM = {
  /** Line area after org header + title + column head on page 1. */
  first: 235,
  /** Line area after continued label + column head on later pages. */
  continued: 268,
  /** Summary box + signature blocks reserved on the last page only. */
  summaryReserve: 52,
  /** Empty margin after the last stop so the last line cannot spill. */
  bottomSafety: 2,
};

/** Compact stop row: ~3px pad × 2 + 11px type + hairline ≈ 6.0mm; long names wrap. */
export function estimateTripChartRowHeightMm(row) {
  const name = String(row?.customer_name ?? "").trim();
  const extra = name.length > 42 ? 1 : 0;
  return 6.0 + extra * 2.8;
}

function sumTripChartHeightMm(rows) {
  return (rows ?? []).reduce((sum, row) => sum + estimateTripChartRowHeightMm(row), 0);
}

/**
 * Pack customer stops onto A4 pages by estimated height so no stop is clipped
 * between sheets (row 36 must appear on page 2, not vanish).
 */
export function chunkTripChartRowsForPrint(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) return [[]];

  const firstBudget = Number(options.firstBudgetMm ?? TRIP_CHART_PAGE_BUDGET_MM.first);
  const continuedBudget = Number(options.continuedBudgetMm ?? TRIP_CHART_PAGE_BUDGET_MM.continued);
  const summaryReserve = Number(options.summaryReserveMm ?? TRIP_CHART_PAGE_BUDGET_MM.summaryReserve);
  const bottomSafety = Number(options.bottomSafetyMm ?? TRIP_CHART_PAGE_BUDGET_MM.bottomSafety);

  const pages = [];
  let index = 0;
  let pageIndex = 0;

  while (index < list.length) {
    const fullBudget =
      (pageIndex === 0 ? firstBudget : continuedBudget) - bottomSafety;
    const chunk = [];
    let used = 0;

    while (index < list.length) {
      const row = list[index];
      const height = estimateTripChartRowHeightMm(row);
      const remainingAfter = list.slice(index + 1);
      const remainingHeight = sumTripChartHeightMm(remainingAfter);
      const restWithThis = height + remainingHeight;
      const fitsAsLastPage = used + restWithThis + summaryReserve <= fullBudget;
      const budget = fitsAsLastPage ? fullBudget - summaryReserve : fullBudget;

      if (chunk.length > 0 && used + height > budget) {
        break;
      }
      chunk.push(row);
      used += height;
      index += 1;
    }

    if (chunk.length === 0) {
      chunk.push(list[index]);
      index += 1;
    }
    pages.push(chunk);
    pageIndex += 1;
  }

  return pages;
}

function tripChartListPrintStyles(generalSettings) {
  const printPx = createOrgPrintPx(generalSettings, "trip_chart");
  const px = printPx.body;
  const fontFamily = orgPrintFontFamilyFromSettings(generalSettings, "trip_chart");

  return `
    ${orgPrintInkStyles(generalSettings, "trip_chart")}
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "trip_chart" })}
    @page { size: A4; margin: 0; }
    * { box-sizing: border-box; }
    html { height: auto; }
    body { margin: 0; font-family: ${fontFamily}; color: #0f172a; font-size: ${px(12)}; }
    .print-page {
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      padding: ${px(12)} ${px(8)};
      padding-bottom: 2mm;
      overflow: visible;
      page-break-after: always;
      break-after: page;
      position: static;
      z-index: 1;
    }
    .print-page:last-of-type {
      page-break-after: auto;
      break-after: auto;
    }
    .sheet {
      width: 100%;
      max-width: 100%;
      box-sizing: border-box;
      overflow: visible;
    }
    .org-header { text-align: center; margin-bottom: ${px(6)}; }
    .org-logo { max-height: ${px(40)}; margin-bottom: ${px(4)}; }
    .org-name { font-size: ${px(16)}; font-weight: 700; letter-spacing: 0.04em; }
    .title-block { text-align: center; margin-bottom: ${px(8)}; }
    .doc-title { font-size: ${px(15)}; font-weight: 700; margin: 0 0 ${px(2)}; }
    .meta-line { font-size: ${px(11)}; margin: ${px(1)} 0; color: #334155; }
    .continued-label {
      font-size: ${px(11)};
      color: #64748b;
      margin: 0 0 ${px(4)};
    }
    /* Block wraps beat <table>/<tr> for Chromium print fragmentation (same as picking list). */
    .stop-lines {
      width: 100%;
      max-width: 100%;
      display: block;
      overflow: visible;
    }
    .stop-head,
    .stop-line {
      display: grid;
      grid-template-columns: minmax(0, 8%) minmax(0, 62%) minmax(0, 30%);
      width: 100%;
      max-width: 100%;
      column-gap: ${px(4)};
      align-items: start;
      box-sizing: border-box;
      font-size: ${px(11)};
    }
    .stop-head > div,
    .stop-line > div {
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
      padding: 0 ${px(4)};
    }
    .stop-line-wrap {
      display: block;
      width: 100%;
      max-width: 100%;
      overflow: visible;
      break-inside: avoid;
      page-break-inside: avoid;
      break-inside: avoid-page;
      -webkit-column-break-inside: avoid;
    }
    .stop-head {
      border-bottom: 2px solid #0f172a;
      padding: ${px(3)} 0;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      font-size: ${px(10)};
      break-after: avoid;
      page-break-after: avoid;
    }
    .stop-line {
      border-bottom: 1px solid #cbd5e1;
      padding: ${px(3)} 0;
    }
    .col-no { text-align: center; }
    .col-total {
      text-align: right;
      font-variant-numeric: tabular-nums;
      font-weight: 600;
      white-space: nowrap;
    }
    .empty { text-align: center; color: #64748b; padding: ${px(16)}; }
    .summary-box,
    .signatures,
    .doc-footer {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .summary-box {
      margin-top: ${px(8)};
      border: 1px solid #94a3b8;
      border-radius: ${px(6)};
      padding: ${px(8)} ${px(10)};
      background: #f8fafc;
    }
    .summary-row {
      display: flex;
      justify-content: space-between;
      gap: ${px(12)};
      font-size: ${px(12)};
      padding: ${px(2)} 0;
    }
    .summary-row.strong { font-weight: 700; font-size: ${px(13)}; border-top: 1px solid #cbd5e1; margin-top: ${px(4)}; padding-top: ${px(6)}; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: ${px(16)};
      margin-top: ${px(12)};
    }
    .signatures h3 { font-size: ${px(11)}; margin: 0 0 ${px(8)}; text-transform: uppercase; letter-spacing: 0.04em; }
    .signatures .line { font-size: ${px(11)}; margin: ${px(6)} 0; }
    .doc-footer { margin-top: ${px(12)}; font-size: ${px(10)}; color: #64748b; }
    @media print {
      body.has-doc-print-edge-footer {
        padding: ${DOCUMENT_PRINT_EDGE_BODY_TOP} ${DOCUMENT_PRINT_EDGE_BODY_SIDES} ${DOCUMENT_PRINT_EDGE_BODY_BOTTOM} ${DOCUMENT_PRINT_EDGE_BODY_SIDES} !important;
      }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: ${px(12, true)}; }
      .print-page {
        width: 100% !important;
        max-width: 100% !important;
        padding: ${px(4, true)} ${px(2, true)} 2mm;
        page-break-after: always !important;
        break-after: page !important;
      }
      .print-page:last-of-type {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      .stop-head { font-size: ${px(10, true)}; }
      .stop-line { font-size: ${px(11, true)}; }
      .stop-line-wrap {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        break-inside: avoid-page !important;
        -webkit-column-break-inside: avoid !important;
      }
    }
  `;
}

function buildTripChartHead() {
  return `
    <div class="stop-head" role="row">
      <div class="col-no">No.</div>
      <div class="col-customer">Customer Name</div>
      <div class="col-total">Order Total</div>
    </div>`;
}

function buildTripChartLineRows(rows) {
  if (!rows.length) {
    return `<div class="stop-line-wrap"><div class="stop-line empty">No delivery stops on this trip chart.</div></div>`;
  }
  return rows
    .map(
      (row) => `
      <div class="stop-line-wrap">
        <div class="stop-line" role="row">
          <div class="col-no">${row.line_no}</div>
          <div class="col-customer">${escapeHtml(row.customer_name)}</div>
          <div class="col-total">KES ${formatKes(row.order_total)}</div>
        </div>
      </div>`,
    )
    .join("");
}

export function buildTripChartListHtml({
  organization = null,
  generalSettings = null,
  organizationName = "Trip Chart List",
  trip = null,
  loadingList = null,
  pickingList = null,
  sales = null,
  orders = null,
  financialSummary = null,
  documentFooterText = null,
  printedBy = null,
  printSettings = null,
} = {}) {
  const branding = brandingWithDocumentLogo(
    resolveReportBranding({
      organization,
      generalSettings,
      organizationNameFallback: organizationName,
    }),
    generalSettings,
    "trip_chart",
  );
  const meta = resolveTripMeta({ trip, loadingList, pickingList });
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
  const tonnage = loadTonnageFromDocuments({ pickingList, loadingList, trip });
  const showTonnage = isLoadTonnageEnabled(printSettings);
  const vehicleTonnageLabel = tonnage.vehicleMaxKg
    ? formatTonnage(tonnage.vehicleMaxKg)
    : "Not set";
  const pickingTonnageLabel = formatTonnage(tonnage.totalKg);
  const remainingKg =
    tonnage.vehicleMaxKg != null ? Math.max(0, tonnage.vehicleMaxKg - tonnage.totalKg) : null;

  const printedByName = resolvePrintedByUser(printedBy);
  const printedAt = formatPrintDisplayDate(new Date());
  const footerBody = documentFooterHtmlFromText(documentFooterText);
  const footerHtml = footerBody ? `<div class="doc-footer">${footerBody}</div>` : "";

  const pageChunks = chunkTripChartRowsForPrint(rows);
  const totalPages = pageChunks.length;
  const docTitle = "TRIP CHART LIST";

  const titleBlockHtml = `
    <div class="title-block">
      <p class="doc-title">${docTitle}</p>
      ${meta.tripCode ? `<p class="meta-line">Trip Chart No: ${escapeHtml(meta.tripCode)}</p>` : ""}
      <p class="meta-line">Route: ${escapeHtml(meta.routeNames)}</p>
      ${meta.scheduledDate ? `<p class="meta-line">Date: ${escapeHtml(formatPrintDisplayDate(meta.scheduledDate))}</p>` : ""}
      ${meta.vehicle ? `<p class="meta-line">Vehicle: ${escapeHtml(meta.vehicle)}</p>` : ""}
      ${meta.driver ? `<p class="meta-line">Driver: ${escapeHtml(meta.driver)}</p>` : ""}
      ${
        showTonnage
          ? `<p class="meta-line">Vehicle tonnage: ${escapeHtml(vehicleTonnageLabel)}</p>
      <p class="meta-line">Picking list tonnage: ${escapeHtml(pickingTonnageLabel)}</p>`
          : ""
      }
    </div>`;

  const summaryHtml = `
    <div class="summary-box">
      <div class="summary-row"><span>Customers delivering to</span><strong>${customerCount}</strong></div>
      <div class="summary-row"><span>Orders on trip</span><strong>${orderCount}</strong></div>
      <div class="summary-row strong"><span>Total amount vehicle is carrying</span><strong>KES ${formatKes(grandTotal)}</strong></div>
      ${
        showTonnage
          ? `<div class="summary-row"><span>Vehicle tonnage</span><strong>${escapeHtml(vehicleTonnageLabel)}</strong></div>
      <div class="summary-row${tonnage.overCapacity ? " strong" : ""}"><span>Picking list tonnage</span><strong>${escapeHtml(pickingTonnageLabel)}${
            tonnage.overCapacity ? " (over capacity)" : ""
          }</strong></div>
      ${
        remainingKg != null
          ? `<div class="summary-row"><span>Remaining capacity</span><strong>${escapeHtml(formatTonnage(remainingKg, { empty: "0 t" }))}</strong></div>`
          : ""
      }`
          : ""
      }
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
    ${footerHtml}`;

  const pagesHtml = pageChunks
    .map((chunk, pageIndex) => {
      const isFirst = pageIndex === 0;
      const isLast = pageIndex === totalPages - 1;
      const pageLabel =
        totalPages > 1
          ? `<p class="continued-label">${
              isFirst
                ? `Page ${pageIndex + 1} of ${totalPages}`
                : `${docTitle}${meta.tripCode ? ` — ${escapeHtml(meta.tripCode)}` : ""} — continued · Page ${pageIndex + 1} of ${totalPages}`
            }</p>`
          : "";
      return `
  <div class="print-page">
    <div class="sheet">
      ${isFirst ? buildReportOrgHeaderHtml(branding, {
        layout: "a4",
        logoLayout: branding.logoLayout ?? null,
      }) : ""}
      ${isFirst ? titleBlockHtml : ""}
      ${pageLabel}
      ${buildTripChartHead()}
      <div class="stop-lines">${buildTripChartLineRows(chunk)}</div>
      ${isLast ? summaryHtml : ""}
    </div>
  </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Trip Chart List${meta.tripCode ? ` — ${escapeHtml(meta.tripCode)}` : ""}</title>
  <style>${tripChartListPrintStyles(generalSettings)}
  ${orgDocumentTemplateCss(printSettings?.trip_chart_document_template, { layout: "classic" })}</style>
</head>
<body class="has-doc-print-edge-footer">
  ${pagesHtml}
  ${buildDocumentPrintEdgeFooterHtml({
    printedBy: printedByName,
    printedAt,
    // Playwright PDF does not bump CSS counters — avoid "Page 0 of 0".
    // Multi-page sheets already show "Page X of Y" in the document body.
    pageLabel: totalPages > 1 ? "hide" : "Page 1 of 1",
  })}
</body>
</html>`;
}

export async function printTripChartList(options = {}) {
  const html = buildTripChartListHtml(options);
  return printHtmlDocument(html, {
    jobType: "trip_chart",
    documentId: options.trip?.id ?? options.trip?.trip_code ?? null,
    windowFeatures: "width=900,height=800",
  });
}

/** Sample trip chart list for Admin → Printouts live preview. */
export function sampleTripChartListPreviewData() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    trip: {
      trip_code: "TC-42",
      scheduled_date: today,
      route_names: ["East Route"],
      vehicle: { plate_number: "KDA 123A", max_weight_kg: 8000 },
      driver: { full_name: "John Driver" },
      sales: [
        {
          stop_no: 1,
          customer_name: "ABC Supermarket",
          order_total: 69000,
          customer_num: 101,
        },
        {
          stop_no: 2,
          customer_name: "XYZ Wholesalers",
          order_total: 231750,
          customer_num: 204,
        },
      ],
    },
    pickingList: {
      total_weight_kg: 7550,
      vehicle_max_weight_kg: 8000,
    },
  };
}
