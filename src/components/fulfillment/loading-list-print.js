import { openPrintWindow } from "@/lib/open-print-window";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import {
  buildReportWatermarkHtml,
  reportWatermarkCss,
  resolveReportBranding,
} from "@/lib/reports/report-branding";

import { resolveLoadingSheetFooterLines, resolveLoadingSheetColumnFlags } from "@/lib/loading-sheet-print-settings";
import { formatPrintDisplayDate } from "@/lib/print-dates";
import {
  buildDocumentPrintEdgeFooterHtml,
  documentPrintEdgeFooterStyles,
} from "@/lib/document-print-edge-footer";
import { documentFooterHtmlFromText } from "@/lib/footer-line-format";
import { formatFulfillmentQty, fulfillmentLoadingListLabels, fulfillmentPackageUnitPrice } from "@/lib/fulfillment-quantity";
import {
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
  orgPrintPx,
} from "@/lib/print-typography";

function formatKes(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatProfitMargin(percent) {
  if (percent == null || Number.isNaN(Number(percent))) return "";
  return ` (${Number(percent).toFixed(1)}%)`;
}

function resolveLoadingSheetRouteHeader({ loadingList, trip, distributionEnabled }) {
  const routeNames =
    (Array.isArray(loadingList?.trip?.route_names) && loadingList.trip.route_names.length
      ? loadingList.trip.route_names.join(" · ")
      : null) ??
    loadingList?.route?.route_name ??
    trip?.route?.route_name ??
    (Array.isArray(trip?.route_names) && trip.route_names.length ? trip.route_names.join(" · ") : null) ??
    "—";

  const tripCode =
    trip?.trip_code ?? loadingList?.trip?.trip_code ?? loadingList?.trip_code ?? null;

  if (distributionEnabled && tripCode) {
    const routes = routeNames && routeNames !== "—" ? routeNames : null;
    return {
      label: "Trip Chart No",
      value: routes ? `${tripCode} (${routes})` : tripCode,
    };
  }

  return { label: "Route Name", value: routeNames };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveOrganizationName({ organization, organizationName, branding }) {
  return (
    branding?.organizationName ||
    organization?.org_name ||
    organization?.name ||
    organizationName ||
    "Loading List"
  );
}

function quantityGhostText(line) {
  const breakdown = String(line.pack_breakdown ?? "").trim();
  if (breakdown) return breakdown;
  const label = String(line.quantity_label ?? "").trim();
  return label || String(line.quantity ?? "");
}

function priceGhostText(line) {
  const display = Number(line.display_unit_price ?? line.unit_price) || 0;
  const base = Number(line.unit_price) || 0;
  if (display > 0 && base > 0 && Math.abs(display - base) > 0.0001) {
    return `Ksh ${formatKes(base)} per piece`;
  }
  const n = base;
  if (!n) return "";
  return Number.isInteger(n) ? String(Math.trunc(n)) : String(n);
}

/** Sample data grouped by customer order for loading at the door. */
export function sampleLoadingListPreviewData() {
  const orders = [
    {
      stop_no: 1,
      order_num: 1042,
      customer_name: "ABC Supermarket",
      payment_status: "unpaid",
      subtotal: 69000,
      lines: [
        {
          line_no: 1,
          product_name: "THAI RICE BIRIYANI",
          quantity_label: "20 bag",
          pack_breakdown: "20 bag",
          unit_price: 2250,
          line_total: 45000,
        },
        {
          line_no: 2,
          product_name: "SUGAR 50 KG",
          quantity_label: "4 bag",
          pack_breakdown: "4 bag",
          unit_price: 6000,
          line_total: 24000,
        },
      ],
    },
    {
      stop_no: 2,
      order_num: 1045,
      customer_name: "XYZ Wholesalers",
      payment_status: "partially_paid",
      subtotal: 231750,
      lines: [
        {
          line_no: 1,
          product_name: "THAI RICE BIRIYANI",
          quantity_label: "46 bag",
          pack_breakdown: "46 bag",
          unit_price: 2250,
          line_total: 103500,
        },
        {
          line_no: 2,
          product_name: "BANJAB RICE 25KG",
          quantity_label: "25 bag",
          pack_breakdown: "25 bag",
          unit_price: 2250,
          line_total: 56250,
        },
        {
          line_no: 3,
          product_name: "SUGAR 50 KG",
          quantity_label: "12 bag",
          pack_breakdown: "12 bag",
          unit_price: 6000,
          line_total: 72000,
        },
      ],
    },
    {
      stop_no: 3,
      order_num: 1048,
      customer_name: "Quick Mart",
      payment_status: "paid",
      subtotal: 30600,
      lines: [
        {
          line_no: 1,
          product_name: "SUGAR 50 KG",
          quantity_label: "4 bag",
          pack_breakdown: "4 bag",
          unit_price: 6200,
          line_total: 24800,
        },
        {
          line_no: 2,
          product_name: "MT. KENYA ESL 500ML",
          quantity_label: "10",
          pack_breakdown: "",
          unit_price: 580,
          line_total: 5800,
        },
      ],
    },
  ];

  const totalAmount = orders.reduce((sum, order) => sum + Number(order.subtotal || 0), 0);

  return {
    loadingList: {
      list_date: "2026-01-30",
      route: { route_name: "C" },
      trip: { trip_code: "TRIP-20260130-001", route_names: ["C"] },
      prepared_by_name: "Preview",
      checked_by_name: "",
      total_amount: totalAmount,
      order_count: orders.length,
      orders,
    },
    trip: {
      trip_code: "TRIP-20260130-001",
      route: { route_name: "C" },
      driver: { full_name: "John Kamau" },
      vehicle: { plate_number: "KCA 123X" },
    },
    financialSummary: {
      order_count: orders.length,
      total_amount: totalAmount,
      total_profit: 82500,
      profit_margin_percent: 24.9,
      expenses: [
        { label: "Fuel", amount: 12000 },
        { label: "Tolls", amount: 1500 },
      ],
      total_expenses: 13500,
      net_profit: 69000,
      net_profit_margin_percent: 20.8,
    },
  };
}

function buildLoadingListHeaderHtml({ branding, companyName }) {
  if (branding?.showHeader === false) return "";

  const parts = [];
  if ((branding?.display === "logo" || branding?.display === "logo_and_name") && branding?.logoUrl) {
    parts.push(
      `<img class="org-logo" src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(companyName)}">`,
    );
  }
  if (companyName) {
    parts.push(`<div class="org-name">${escapeHtml(String(companyName).toUpperCase())}</div>`);
  }

  return parts.length ? `<div class="org-header">${parts.join("")}</div>` : "";
}

function normalizeLoadingListOrders(loadingList, uomByProductCode = null) {
  if (Array.isArray(loadingList?.orders) && loadingList.orders.length > 0) {
    return loadingList.orders.map((order, index) => ({
      ...order,
      stop_no: order.stop_no ?? index + 1,
      lines: normalizeLoadingListLines(order.lines ?? [], uomByProductCode),
    }));
  }

  const flatLines = normalizeLoadingListLines(loadingList?.lines ?? [], uomByProductCode);
  if (flatLines.length === 0) return [];

  return [
    {
      stop_no: 1,
      order_num: "—",
      customer_name: "All orders",
      subtotal: flatLines.reduce((sum, line) => sum + Number(line.line_total || 0), 0),
      lines: flatLines,
    },
  ];
}

function loadingListLineCount(loadingList) {
  const orders = normalizeLoadingListOrders(loadingList);
  return orders.reduce((sum, order) => sum + (order.lines?.length ?? 0), 0);
}


function buildCustomerStopHtml(order, { showQtyColumn, showPriceColumns, showPriceColumnsForSubtotal }) {
  const lines = order.lines ?? [];
  const columnCount = loadingListColumnCount({ showQtyColumn, showPriceColumns });
  const tableLayoutClass = loadingListTableLayoutClass({ showQtyColumn, showPriceColumns });
  const tableHead = buildLoadingListTableHead({ showQtyColumn, showPriceColumns });
  const rowHtml =
    buildLoadingListLineRows(lines, { showQtyColumn, showPriceColumns }) ||
    `<tr><td colspan="${columnCount}" class="empty">No line items</td></tr>`;

  const orderLabel = order.order_num ? `#${order.order_num}` : "Order";

  const subtotalRow =
    showPriceColumnsForSubtotal && showPriceColumns
      ? `
      <tfoot>
        <tr class="customer-stop-subtotal">
          <td colspan="${columnCount - 1}" style="text-align:right;">Subtotal</td>
          <td class="col-total">${formatKes(order.subtotal ?? lines.reduce((sum, line) => sum + Number(line.line_total || 0), 0))}</td>
        </tr>
      </tfoot>`
      : "";

  return `
  <section class="customer-stop">
    <div class="customer-stop-header">
      <p class="customer-stop-title">Stop ${order.stop_no} — ${escapeHtml(order.customer_name ?? "Customer")}</p>
      <p class="customer-stop-meta">${escapeHtml(orderLabel)}</p>
    </div>
    <table class="${tableLayoutClass} customer-stop-table">
      <thead>${tableHead}</thead>
      <tbody>${rowHtml}</tbody>
      ${subtotalRow}
    </table>
  </section>`;
}

function buildLoadingListOrdersHtml(orders, { showQtyColumn, showPriceColumns }) {
  if (!orders.length) {
    const columnCount = loadingListColumnCount({ showQtyColumn, showPriceColumns });
    return `<p class="empty">No orders on this loading list.</p>`;
  }

  return orders
    .map((order) =>
      buildCustomerStopHtml(order, {
        showQtyColumn,
        showPriceColumns,
        showPriceColumnsForSubtotal: true,
      }),
    )
    .join("");
}

function buildTripSummaryHtml({ orders, total, showPriceColumns }) {
  const orderCount = orders.length;
  const lineCount = orders.reduce((sum, order) => sum + (order.lines?.length ?? 0), 0);

  return `
  <div class="trip-summary">
    <p class="trip-summary-title">Trip summary</p>
    <p>Orders: ${orderCount} · Product lines: ${lineCount}${
      showPriceColumns ? ` · Trip total: KES ${formatKes(total)}` : ""
    }</p>
  </div>`;
}

function normalizeLoadingListLines(lines, uomByProductCode = null) {
  return (lines ?? []).map((line, index) => {
    const productCode = String(line.product_code ?? "").trim();
    const productName = String(line.product_name ?? "").trim();
    const resolvedName =
      productName && productName !== productCode ? productName : productName || productCode;
    const baseQty = Number(line.quantity ?? 0);
    let quantityLabel;
    let packBreakdown;

    if (uomByProductCode) {
      const labels = fulfillmentLoadingListLabels(baseQty, line, uomByProductCode);
      quantityLabel = labels.quantityLabel;
      packBreakdown = labels.packBreakdown;
    } else if (
      line.quantity_label &&
      line.pack_breakdown &&
      line.quantity_label !== line.pack_breakdown
    ) {
      quantityLabel = String(line.quantity_label).trim();
      packBreakdown = String(line.pack_breakdown).trim();
    } else {
      quantityLabel = String(line.quantity_label ?? baseQty).trim();
      packBreakdown = String(line.pack_breakdown ?? "").trim();
    }

    if (packBreakdown && packBreakdown === quantityLabel) {
      packBreakdown = "";
    }

    return {
      ...line,
      line_no: line.line_no ?? index + 1,
      product_name: resolvedName,
      quantity_label: quantityLabel,
      pack_breakdown: packBreakdown,
      display_unit_price: fulfillmentPackageUnitPrice(line, uomByProductCode),
    };
  });
}

function buildLoadingListLineRows(lines, { showQtyColumn = true, showPriceColumns = true } = {}) {
  return normalizeLoadingListLines(lines)
    .map((line) => {
      const qtyMain = escapeHtml(line.quantity_label || line.quantity);
      const qtyGhost = escapeHtml(quantityGhostText(line));

      const qtyCell = showQtyColumn
        ? `
        <td class="col-qty">
          <div class="main">${qtyMain}</div>
          ${qtyGhost ? `<div class="ghost">${qtyGhost}</div>` : ""}
        </td>`
        : "";

      const priceCells = showPriceColumns
        ? `
        <td class="col-price">
          <div class="main">Ksh ${formatKes(line.display_unit_price ?? line.unit_price)}</div>
          ${priceGhostText(line) ? `<div class="ghost">${escapeHtml(priceGhostText(line))}</div>` : ""}
        </td>
        <td class="col-total">${formatKes(line.line_total)}</td>`
        : "";

      return `
      <tr>
        <td class="col-no">${line.line_no}</td>
        <td class="col-product">${escapeHtml(String(line.product_name ?? "").toUpperCase())}</td>${qtyCell}${priceCells}
      </tr>`;
    })
    .join("");
}

function buildLoadingListTableHead({ showQtyColumn, showPriceColumns }) {
  const headers = [
    '<th class="col-no">No.</th>',
    '<th class="col-product">Product Name</th>',
  ];
  if (showQtyColumn) {
    headers.push(
      showPriceColumns
        ? '<th class="col-qty">Total Items<br/>(Breakdown in Packages)</th>'
        : '<th class="col-qty">Total Qty</th>',
    );
  }
  if (showPriceColumns) {
    headers.push('<th class="col-price">Price (R/W)</th>', '<th class="col-total">Line Total</th>');
  }
  return `<tr>${headers.join("")}</tr>`;
}

function loadingListColumnCount({ showQtyColumn, showPriceColumns }) {
  let count = 2;
  if (showQtyColumn) count += 1;
  if (showPriceColumns) count += 2;
  return count;
}

function buildLoadingSheetTotalsHtml({
  loadingListTotal,
  financialSummary = null,
  showListTotal = true,
  showExpenses = true,
  showProfit = true,
}) {
  if (!showListTotal && !showExpenses && !showProfit) return "";

  const summary = financialSummary ?? {};
  const expenseRows = Array.isArray(summary.expenses) ? summary.expenses : [];
  const profitAmount = summary.total_profit;
  const netProfitAmount = summary.net_profit ?? profitAmount;
  const hasProfitData = profitAmount != null && !Number.isNaN(Number(profitAmount));

  const parts = [`<div class="sheet-totals"><h3 class="sheet-totals-title">Totals</h3>`];

  if (showListTotal) {
    parts.push(`
      <div class="sheet-totals-row sheet-totals-strong">
        <span>Loading sheet total</span>
        <span>KES ${formatKes(loadingListTotal)}</span>
      </div>`);
  }

  if (showExpenses) {
    const expenseLines = expenseRows.length
      ? expenseRows
          .map(
            (row) =>
              `<div class="sheet-totals-row"><span>${escapeHtml(row.label ?? "Expense")}</span><span>KES ${formatKes(row.amount)}</span></div>`,
          )
          .join("")
      : `<div class="sheet-totals-row sheet-totals-muted"><span>No trip expenses recorded</span><span>—</span></div>`;

    parts.push(`
      <div class="sheet-totals-section">
        <div class="sheet-totals-subtitle">Expenses</div>
        ${expenseLines}
        ${
          expenseRows.length
            ? `<div class="sheet-totals-row sheet-totals-strong"><span>Total expenses</span><span>KES ${formatKes(summary.total_expenses)}</span></div>`
            : ""
        }
      </div>`);
  }

  if (showProfit && hasProfitData) {
    parts.push(`
      <div class="sheet-totals-row sheet-totals-strong">
        <span>Profit made</span>
        <span>KES ${formatKes(profitAmount)}${formatProfitMargin(summary.profit_margin_percent)}</span>
      </div>
      <div class="sheet-totals-row sheet-totals-emphasis">
        <span>Profit minus expenses</span>
        <span>KES ${formatKes(netProfitAmount)}${formatProfitMargin(summary.net_profit_margin_percent ?? summary.profit_margin_percent)}</span>
      </div>`);
  }

  parts.push("</div>");
  return parts.join("");
}

/** CSS layout class for table column sizing based on visible columns. */
export function loadingListTableLayoutClass({ showQtyColumn, showPriceColumns }) {
  if (showQtyColumn && showPriceColumns) return "layout-full";
  if (showQtyColumn && !showPriceColumns) return "layout-qty-only";
  if (!showQtyColumn && showPriceColumns) return "layout-price-only";
  return "layout-product-only";
}

function loadingSheetPrintStyles(generalSettings = null) {
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
      margin: 20px 28px;
      font-size: ${px(12)};
      line-height: 1.35;
      position: relative;
      min-height: 100%;
      ${orgPrintInkStyles(generalSettings, "loading_sheet")}
    }
    .page {
      max-width: 900px;
      margin: 0 auto;
      position: relative;
      z-index: 1;
    }
    .page-body { }
    ${reportWatermarkCss()}
    .sheet { position: relative; z-index: 1; }
    .org-header { text-align: center; margin-bottom: 16px; }
    .org-logo { display: block; margin: 0 auto 10px; max-height: 56px; max-width: 220px; object-fit: contain; }
    .org-name {
      margin: 0;
      font-size: ${px(22)};
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      line-height: 1.2;
    }
    .title-block { text-align: center; margin-bottom: 20px; }
    .title-block .doc-title {
      margin: 0;
      font-size: ${px(14)};
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      line-height: 1.35;
    }
    .title-block .route-name {
      margin: 10px 0 0;
      font-size: ${px(13)};
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      line-height: 1.35;
    }
    .trip-meta {
      margin: 8px 0 0;
      font-size: ${px(11)};
      color: #475569;
      line-height: 1.45;
    }
    .customer-stop {
      margin-top: 24px;
      page-break-inside: avoid;
    }
    .customer-stop:first-of-type { margin-top: 0; }
    .customer-stop-header {
      border-top: 2px solid #333;
      border-bottom: 1px solid #c9c9c9;
      padding: 10px 0 8px;
      margin-bottom: 4px;
    }
    .customer-stop-title {
      margin: 0;
      font-size: ${px(12)};
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      line-height: 1.35;
    }
    .customer-stop-meta {
      margin: 4px 0 0;
      font-size: ${px(11)};
      color: #475569;
    }
    .customer-stop-table { margin-bottom: 0; }
    .customer-stop-subtotal td {
      padding-top: 10px;
      font-weight: 700;
      border-top: 1px dashed #cbd5e1;
    }
    .trip-summary {
      margin-top: 28px;
      padding-top: 14px;
      border-top: 2px solid #333;
      font-size: ${px(12)};
      line-height: 1.5;
    }
    .trip-summary-title {
      margin: 0 0 8px;
      font-size: ${px(12)};
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    thead th {
      background: #ececec;
      font-size: ${px(11)};
      font-weight: 700;
      text-transform: none;
      text-align: left;
      padding: 10px 8px;
      border-top: 1px solid #c9c9c9;
      border-bottom: 1px solid #c9c9c9;
      vertical-align: bottom;
      line-height: 1.25;
    }
    tbody td {
      padding: 12px 8px 0;
      border: none;
      vertical-align: top;
      line-height: 1.3;
    }
    tbody tr:first-child td { padding-top: 14px; }
    tbody tr + tr td { padding-top: 16px; }
    .col-no { width: 40px; text-align: left; }
    .col-product {
      text-align: left;
      font-weight: 700;
      text-transform: uppercase;
      padding-right: 12px;
      word-break: break-word;
    }
    .col-qty, .col-price { white-space: nowrap; }
    .col-total { white-space: nowrap; font-weight: 400; }
    .main { font-weight: 700; }
    .ghost { color: #8a8a8a; font-size: ${px(10)}; font-weight: 400; margin-top: 3px; line-height: 1.2; }

    /* All columns visible */
    table.layout-full .col-product { width: 34%; }
    table.layout-full .col-qty,
    table.layout-full .col-price { text-align: left; }
    table.layout-full thead th.col-total,
    table.layout-full tbody td.col-total,
    table.layout-full tfoot td.col-total { text-align: right; }

    /* Quantity only — qty column pinned to the right */
    table.layout-qty-only .col-product { width: auto; }
    table.layout-qty-only .col-qty {
      width: 120px;
      text-align: right;
    }
    table.layout-qty-only thead th.col-qty,
    table.layout-qty-only tbody td.col-qty { text-align: right; }
    table.layout-qty-only .col-qty .main,
    table.layout-qty-only .col-qty .ghost { text-align: right; }

    /* Price columns without quantity */
    table.layout-price-only .col-product { width: auto; }
    table.layout-price-only .col-price { width: 110px; text-align: left; }
    table.layout-price-only .col-total { width: 110px; }
    table.layout-price-only thead th.col-total,
    table.layout-price-only tbody td.col-total,
    table.layout-price-only tfoot td.col-total { text-align: right; }

    /* Product names only */
    table.layout-product-only .col-product { width: auto; }

    .empty { text-align: center; padding: 24px; color: #666; }
    tfoot td {
      padding: 14px 8px 0;
      border: none;
      font-weight: 700;
      font-size: ${px(13)};
    }
    tfoot .col-total { text-align: right; }
    .sheet-totals {
      margin-top: 28px;
      max-width: 420px;
      margin-left: auto;
      border-top: 1px solid #c9c9c9;
      padding-top: 14px;
    }
    .sheet-totals-title {
      margin: 0 0 10px;
      font-size: ${px(12)};
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .sheet-totals-section { margin: 12px 0; }
    .sheet-totals-subtitle {
      margin: 0 0 6px;
      font-size: ${px(11)};
      font-weight: 700;
      color: #475569;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .sheet-totals-row {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      padding: 4px 0;
      font-size: ${px(12)};
      line-height: 1.35;
    }
    .sheet-totals-row span:last-child { white-space: nowrap; text-align: right; }
    .sheet-totals-strong { font-weight: 700; }
    .sheet-totals-emphasis {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #cbd5e1;
      font-weight: 700;
    }
    .sheet-totals-muted { color: #64748b; font-style: italic; }
    .signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 32px;
      margin-top: 36px;
    }
    .signatures h3 {
      margin: 0 0 48px;
      font-size: ${px(12)};
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .signatures .line {
      border-top: 1px solid #333;
      padding-top: 6px;
      margin-top: 40px;
      font-size: ${px(11)};
    }
    .doc-footer {
      margin-top: 12px;
      text-align: center;
      font-size: ${px(10)};
      color: #64748b;
    }
    .doc-footer-line {
      margin-top: 8px;
      text-align: center;
      font-size: ${px(10)};
      font-weight: 700;
      color: #334155;
    }
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "loading_sheet" })}
    @media print {
      body { margin: 0; font-size: ${px(12, true)}; }
      .org-name { font-size: ${px(22, true)}; }
      .title-block .doc-title { font-size: ${px(14, true)}; }
      .title-block .route-name { font-size: ${px(13, true)}; }
      thead th { font-size: ${px(11, true)}; }
      .ghost { font-size: ${px(10, true)}; }
      tfoot td { font-size: ${px(13, true)}; }
      .sheet-totals-title { font-size: ${px(12, true)}; }
      .sheet-totals-subtitle,
      .sheet-totals-row { font-size: ${px(12, true)}; }
      .signatures h3 { font-size: ${px(12, true)}; }
      .signatures .line { font-size: ${px(11, true)}; }
      .doc-footer, .doc-footer-line { font-size: ${px(10, true)}; }
    }
  `;
}

export function buildLoadingListHtml({
  organization = null,
  generalSettings = null,
  organizationName = "Loading List",
  loadingList,
  trip = null,
  financialSummary = null,
  printSettings = null,
  documentFooterText = null,
  footerLines = null,
  printedBy = null,
  distributionEnabled = false,
  uomByProductCode = null,
} = {}) {
  const branding = resolveReportBranding({ organization, generalSettings });
  const orgHeader = buildLoadingListHeaderHtml({
    branding,
    companyName: resolveOrganizationName({ organization, organizationName, branding }),
  });
  const watermark = buildReportWatermarkHtml(branding);
  const companyName = resolveOrganizationName({ organization, organizationName, branding });
  const columnFlags = resolveLoadingSheetColumnFlags(printSettings ?? {});
  const {
    showQtyColumn,
    showPriceColumns,
    showSignatures,
    showTotal,
    showTripExpenses,
    showTripProfit,
  } = columnFlags;

  const orders = normalizeLoadingListOrders(loadingList, uomByProductCode);
  const routeHeader = resolveLoadingSheetRouteHeader({ loadingList, trip, distributionEnabled });
  const routeName = routeHeader.value;
  const listDate = loadingList?.list_date ?? trip?.scheduled_date;
  const preparedBy = loadingList?.prepared_by_name ?? trip?.prepared_by_name ?? "";
  const checkedBy =
    loadingList?.checked_by_name ??
    trip?.checked_by_name ??
    printSettings?.loading_sheet_default_checked_by ??
    "";
  const total =
    loadingList?.total_amount ??
    orders.reduce(
      (sum, order) => sum + Number(order.subtotal ?? order.lines?.reduce((s, line) => s + Number(line.line_total || 0), 0) ?? 0),
      0,
    );
  const resolvedFinancialSummary =
    financialSummary ?? loadingList?.financial_summary ?? trip?.financial_summary ?? null;
  const dateLabel = formatPrintDisplayDate(listDate, { emptyLabel: "—" });
  const driverName = trip?.driver?.full_name ?? loadingList?.trip?.driver?.full_name ?? "";
  const vehicleLabel =
    trip?.vehicle?.plate_number ??
    trip?.vehicle?.vehicle_name ??
    loadingList?.trip?.vehicle?.plate_number ??
    "";
  const tripMetaParts = [];
  if (vehicleLabel) tripMetaParts.push(`Vehicle: ${vehicleLabel}`);
  if (driverName) tripMetaParts.push(`Driver: ${driverName}`);
  const tripMetaHtml = tripMetaParts.length
    ? `<p class="trip-meta">${escapeHtml(tripMetaParts.join(" · "))}</p>`
    : "";

  const ordersHtml = buildLoadingListOrdersHtml(orders, { showQtyColumn, showPriceColumns });
  const tripSummaryHtml = buildTripSummaryHtml({ orders, total, showPriceColumns: showPriceColumns && showTotal });

  const totalsHtml = buildLoadingSheetTotalsHtml({
    loadingListTotal: total,
    financialSummary: resolvedFinancialSummary,
    showListTotal: showTotal,
    showExpenses: showTripExpenses,
    showProfit: showTripProfit,
  });

  const signaturesHtml = showSignatures
    ? `
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
  </div>`
    : "";

  const resolvedFooterLines =
    footerLines ??
    resolveLoadingSheetFooterLines(printSettings ?? {});
  const footerLinesHtml = resolvedFooterLines
    .map((line) => `<p class="doc-footer-line">${escapeHtml(line)}</p>`)
    .join("");
  const footerText = documentFooterText ?? branding.documentFooterText ?? "";
  const footerHtml = footerText
    ? `<div class="doc-footer">${documentFooterHtmlFromText(footerText, { layout: "block", tag: "p" })}</div>`
    : "";
  const printedAt = new Date().toLocaleString("en-GB");
  const printedByName = resolvePrintedByUser(printedBy) ?? "—";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Loading List — ${escapeHtml(routeName)}</title>
  <style>${loadingSheetPrintStyles(generalSettings)}</style>
</head>
<body class="has-doc-print-edge-footer">
  ${watermark}
  <div class="page">
    <div class="page-body">
  <div class="sheet">
    ${
      orgHeader ||
      `<div class="org-header"><div class="org-name">${escapeHtml(companyName)}</div></div>`
    }
    <div class="title-block">
      <p class="doc-title">Loading List, Date: ${escapeHtml(dateLabel)}</p>
      <p class="route-name">${escapeHtml(routeHeader.label)}: ${escapeHtml(routeName)}</p>
      ${tripMetaHtml}
    </div>
    ${ordersHtml}
    ${tripSummaryHtml}
    ${totalsHtml}
    ${signaturesHtml}
    ${footerLinesHtml}
    ${footerHtml}
  </div>
    </div>
  </div>
  ${buildDocumentPrintEdgeFooterHtml({
    printedBy: printedByName,
    printedAt,
  })}
</body>
</html>`;
}

/**
 * @param {{
 *   organization?: object,
 *   generalSettings?: object,
 *   organizationName?: string,
 *   loadingList: object,
 *   trip?: object,
 *   financialSummary?: object,
 *   printSettings?: object,
 *   documentFooterText?: string,
 *   printedBy?: string | null,
 * }} options
 */
export function printLoadingList({
  organization = null,
  generalSettings = null,
  organizationName = "Loading List",
  loadingList,
  trip = null,
  financialSummary = null,
  printSettings = null,
  documentFooterText = null,
  printedBy = null,
  distributionEnabled = false,
  uomByProductCode = null,
} = {}) {
  const html = buildLoadingListHtml({
    organization,
    generalSettings,
    organizationName,
    loadingList,
    trip,
    financialSummary,
    printSettings,
    documentFooterText,
    printedBy,
    distributionEnabled,
    uomByProductCode,
  });
  openPrintWindow(html, "width=900,height=800");
}
