import { openPrintWindow } from "@/lib/open-print-window";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import {
  buildReportOrgHeaderHtml,
  resolveReportBranding,
} from "@/lib/reports/report-branding";
import { brandingWithDocumentLogo } from "@/lib/document-logo-settings";
import { formatPrintDisplayDate } from "@/lib/print-dates";
import {
  buildDocumentPrintEdgeFooterHtml,
  documentPrintEdgeFooterStyles,
} from "@/lib/document-print-edge-footer";
import { documentFooterHtmlFromText } from "@/lib/footer-line-format";
import { formatFulfillmentQty } from "@/lib/fulfillment-quantity";
import {
  createOrgPrintPx,
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
} from "@/lib/print-typography";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatQty(value) {
  const n = Number(value) || 0;
  return n % 1 === 0 ? String(Math.trunc(n)) : n.toLocaleString("en-KE", { maximumFractionDigits: 2 });
}

function formatKes(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Leading package count from labels like "26 Jer" / "4 Bag, 10 kg". */
export function primaryPackageCountFromLine(line) {
  const label = String(line?.quantity_label ?? line?.wholesale_qty_label ?? "").trim();
  const match = label.match(/^([\d,]+(?:\.\d+)?)/);
  if (match) {
    const n = Number(String(match[1]).replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  if (line?.sort_qty != null && Number.isFinite(Number(line.sort_qty))) {
    return Number(line.sort_qty);
  }
  return Number(line?.required_qty ?? line?.quantity ?? 0) || 0;
}

/** Highest displayed package count first (26 jer before 4 bag). */
export function sortPickingLinesByPackageCount(lines) {
  return [...(lines ?? [])]
    .sort((a, b) => {
      const qtyCmp = primaryPackageCountFromLine(b) - primaryPackageCountFromLine(a);
      if (qtyCmp !== 0) return qtyCmp;
      const baseCmp =
        Number(b?.required_qty ?? b?.quantity ?? 0) - Number(a?.required_qty ?? a?.quantity ?? 0);
      if (baseCmp !== 0) return baseCmp;
      return String(a?.product_name ?? "").localeCompare(String(b?.product_name ?? ""));
    })
    .map((line, index) => ({ ...line, line_no: index + 1 }));
}

function resolveRouteHeader({ pickingList, trip }) {
  const routeNames =
    (Array.isArray(pickingList?.trip?.route_names) && pickingList.trip.route_names.length
      ? pickingList.trip.route_names.join(" · ")
      : null) ??
    pickingList?.route?.route_name ??
    trip?.route?.route_name ??
    (Array.isArray(trip?.route_names) && trip.route_names.length ? trip.route_names.join(" · ") : null) ??
    "—";

  const tripCode = trip?.trip_code ?? pickingList?.trip?.trip_code ?? null;
  const vehicle =
    trip?.vehicle?.plate_number ??
    trip?.vehicle?.vehicle_name ??
    pickingList?.trip?.vehicle?.plate_number ??
    null;
  const driver = trip?.driver?.full_name ?? pickingList?.trip?.driver?.full_name ?? null;

  return { routeNames, tripCode, vehicle, driver };
}

function buildPickingListHeaderHtml({ branding }) {
  return buildReportOrgHeaderHtml(branding, {
    layout: "a4",
    logoLayout: branding?.logoLayout ?? null,
  });
}

/** Mobile / field-sales picking (Distribution off). */
export function isSalesPickingLayout(pickingList, layout) {
  if (layout === "sales" || layout === "mobile") return true;
  if (layout === "distribution") return false;
  return String(pickingList?.layout ?? "") === "sales";
}

function normalizePickingLines(lines, uomByProductCode) {
  return (lines ?? []).map((line, index) => {
    const required = Number(line.required_qty ?? line.quantity ?? 0);
    const picked = Number(line.picked_qty ?? required);
    const shortage = Math.max(0, Number(line.shortage_qty ?? required - picked));
    const requestedLabel = formatFulfillmentQty(required, line, uomByProductCode);
    const pickedLabel = formatFulfillmentQty(picked, line, uomByProductCode);
    const shortageLabel = shortage > 0 ? formatFulfillmentQty(shortage, line, uomByProductCode) : "—";

    const quantityLabel =
      String(line.quantity_label ?? "").trim() ||
      [line.wholesale_qty_label, line.retail_qty_label].filter(Boolean).join(", ") ||
      requestedLabel;

    return {
      ...line,
      line_no: line.line_no ?? index + 1,
      shelf_location: line.shelf_location || "—",
      stock_location: line.stock_location || "store",
      required_qty: required,
      picked_qty: picked,
      shortage_qty: shortage,
      quantity_label: quantityLabel,
      picked_label: pickedLabel,
      shortage_label: shortageLabel,
      retail_breakdown: String(line.retail_breakdown ?? "").trim(),
      price_label: String(line.price_label ?? "").trim(),
      line_total: Number(line.line_total ?? 0),
      pack_breakdown:
        line.pack_breakdown && line.pack_breakdown !== requestedLabel ? line.pack_breakdown : "",
    };
  });
}

function buildDistributionPickingLineRows(lines, includeShelfLocation = true) {
  return lines
    .map((line) => {
      const hasShortage = Number(line.shortage_qty) > 0.0001;
      const shortageClass = hasShortage ? "shortage" : "";
      const shelfCell = includeShelfLocation
        ? `<td class="col-shelf">${escapeHtml(line.shelf_location)}</td>`
        : "";

      return `
      <tr class="${shortageClass}">
        <td class="col-no">${line.line_no}</td>
        ${shelfCell}
        <td class="col-product">
          <div class="main">${escapeHtml(String(line.product_name ?? "").toUpperCase())}</div>
        </td>
        <td class="col-qty">${escapeHtml(line.quantity_label)}</td>
        <td class="col-picked">${escapeHtml(line.picked_label)}</td>
        <td class="col-shortage">${line.shortage_qty > 0.0001 ? escapeHtml(line.shortage_label) : "—"}</td>
      </tr>`;
    })
    .join("");
}

function buildSalesPickingLineRows(lines) {
  return lines
    .map((line) => {
      const qtyGhost = line.retail_breakdown
        ? `<div class="ghost">(${escapeHtml(line.retail_breakdown)})</div>`
        : "";
      const priceMain = line.price_label
        ? escapeHtml(line.price_label)
        : `Ksh ${formatKes(line.unit_price ?? 0)}`;

      return `
      <tr>
        <td class="col-no">${line.line_no}</td>
        <td class="col-product">
          <div class="main">${escapeHtml(String(line.product_name ?? "").toUpperCase())}</div>
        </td>
        <td class="col-qty">
          <div class="main">${escapeHtml(line.quantity_label)}</div>
          ${qtyGhost}
        </td>
        <td class="col-price">${priceMain}</td>
        <td class="col-total">${formatKes(line.line_total)}</td>
      </tr>`;
    })
    .join("");
}

function pickingListPrintStyles(generalSettings, { salesLayout = false, includeShelfLocation = true } = {}) {
  const printPx = createOrgPrintPx(generalSettings, "picking_list");
  const px = printPx.body;
  const fontFamily = orgPrintFontFamilyFromSettings(generalSettings, "picking_list");

  if (salesLayout) {
    return `
    ${orgPrintInkStyles(generalSettings, "picking_list")}
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "picking_list" })}
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ${fontFamily}; color: #0f172a; font-size: ${px(12)}; }
    .page { padding: ${px(24)}; }
    .org-header { text-align: center; margin-bottom: ${px(12)}; }
    .org-logo { max-height: ${px(48)}; margin-bottom: ${px(6)}; }
    .org-name { font-size: ${px(16)}; font-weight: 700; letter-spacing: 0.04em; }
    .title-block { text-align: center; margin-bottom: ${px(16)}; }
    .doc-title { font-size: ${px(15)}; font-weight: 700; margin: 0 0 ${px(4)}; }
    .meta-line { font-size: ${px(12)}; margin: ${px(2)} 0; color: #334155; }
    table { width: 100%; border-collapse: collapse; font-size: ${px(12)}; }
    thead th { border-bottom: 2px solid #0f172a; padding: ${px(8)} ${px(6)}; text-align: left; vertical-align: bottom; }
    tbody td { border-bottom: 1px solid #cbd5e1; padding: ${px(8)} ${px(6)}; vertical-align: top; }
    .col-no { width: 5%; text-align: center; }
    .col-product { width: 28%; }
    .col-qty { width: 24%; }
    .col-price { width: 26%; }
    .col-total { width: 17%; text-align: right; }
    .ghost { font-size: ${px(10)}; color: #64748b; margin-top: ${px(2)}; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: ${px(24)}; margin-top: ${px(24)}; }
    .signatures h3 { font-size: ${px(12)}; margin: 0 0 ${px(8)}; }
    .signatures .line { font-size: ${px(11)}; margin: ${px(6)} 0; }
    .summary-box { margin-top: ${px(16)}; padding: ${px(12)}; border: 1px solid #cbd5e1; border-radius: ${px(6)}; }
    .summary-row { display: flex; justify-content: space-between; font-size: ${px(13)}; margin: ${px(4)} 0; font-weight: 600; }
    .empty { text-align: center; color: #64748b; padding: ${px(16)}; }
    @media print {
      body { font-size: ${px(12, true)}; }
      .page { padding: ${px(12, true)}; }
      thead th { font-size: ${px(11, true)}; }
      tbody td { font-size: ${px(11, true)}; }
    }
  `;
  }

  return `
    ${orgPrintInkStyles(generalSettings, "picking_list")}
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "picking_list" })}
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ${fontFamily}; color: #0f172a; font-size: ${px(12)}; }
    .page { padding: ${px(24)}; }
    .org-header { text-align: center; margin-bottom: ${px(12)}; }
    .org-logo { max-height: ${px(48)}; margin-bottom: ${px(6)}; }
    .org-name { font-size: ${px(16)}; font-weight: 700; letter-spacing: 0.04em; }
    .title-block { text-align: center; margin-bottom: ${px(16)}; }
    .doc-title { font-size: ${px(15)}; font-weight: 700; margin: 0 0 ${px(4)}; }
    .meta-line { font-size: ${px(12)}; margin: ${px(2)} 0; color: #334155; }
    table { width: 100%; border-collapse: collapse; font-size: ${px(12)}; }
    thead th { border-bottom: 2px solid #0f172a; padding: ${px(8)} ${px(6)}; text-align: left; }
    tbody td { border-bottom: 1px solid #cbd5e1; padding: ${px(8)} ${px(6)}; vertical-align: top; }
    .col-no { width: 5%; text-align: center; }
    ${includeShelfLocation ? ".col-shelf { width: 12%; }" : ""}
    .col-product { width: ${includeShelfLocation ? "34%" : "46%"}; }
    .col-qty, .col-picked, .col-shortage { width: 13%; text-align: right; }
    .ghost { font-size: ${px(10)}; color: #64748b; margin-top: ${px(2)}; }
    tr.shortage td { background: #fff7ed; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: ${px(24)}; margin-top: ${px(24)}; }
    .signatures h3 { font-size: ${px(12)}; margin: 0 0 ${px(8)}; }
    .signatures .line { font-size: ${px(11)}; margin: ${px(6)} 0; }
    .summary-box { margin-top: ${px(16)}; padding: ${px(12)}; border: 1px solid #cbd5e1; border-radius: ${px(6)}; }
    .summary-row { display: flex; justify-content: space-between; font-size: ${px(12)}; margin: ${px(4)} 0; }
    .empty { text-align: center; color: #64748b; padding: ${px(16)}; }
    @media print {
      body { font-size: ${px(12, true)}; }
      .page { padding: ${px(12, true)}; }
      thead th { font-size: ${px(11, true)}; }
      tbody td { font-size: ${px(11, true)}; }
    }
  `;
}

export function buildPickingListHtml({
  organization = null,
  generalSettings = null,
  organizationName = "Picking List",
  pickingList,
  trip = null,
  documentFooterText = null,
  printedBy = null,
  includeShelfLocation = true,
  uomByProductCode = null,
  layout = null,
} = {}) {
  const salesLayout = isSalesPickingLayout(pickingList, layout);
  const branding = brandingWithDocumentLogo(
    resolveReportBranding({ organization, generalSettings, organizationNameFallback: organizationName }),
    generalSettings,
    "picking_list",
  );
  const orgHeader = buildPickingListHeaderHtml({ branding });
  const normalized = normalizePickingLines(pickingList?.lines ?? [], uomByProductCode);
  const lines = salesLayout ? sortPickingLinesByPackageCount(normalized) : normalized;
  const meta = resolveRouteHeader({ pickingList, trip });
  const listDate = pickingList?.list_date ?? trip?.scheduled_date;
  const dateLabel = formatPrintDisplayDate(listDate, { emptyLabel: "—" });
  const listNumber = pickingList?.list_number ?? "—";
  const pickerName = pickingList?.picker_name ?? "";

  let columnCount;
  let tableHead;
  let rowHtml;
  let summaryHtml;

  if (salesLayout) {
    columnCount = 5;
    tableHead = `
          <tr>
            <th class="col-no">No.</th>
            <th class="col-product">Product Name</th>
            <th class="col-qty">Quantity (W, Retail)</th>
            <th class="col-price">Price (W, R)</th>
            <th class="col-total">Line amount</th>
          </tr>`;
    rowHtml =
      buildSalesPickingLineRows(lines) ||
      `<tr><td colspan="${columnCount}" class="empty">No products to pick</td></tr>`;
    const orderTotal =
      pickingList?.order_total_value != null
        ? Number(pickingList.order_total_value)
        : lines.reduce((sum, line) => sum + Number(line.line_total || 0), 0);
    summaryHtml = `
      <div class="summary-box">
        <div class="summary-row"><span>Totals Value of Order</span><strong>KES ${formatKes(orderTotal)}</strong></div>
      </div>`;
  } else {
    const totalRequired = lines.reduce((sum, line) => sum + Number(line.required_qty || 0), 0);
    const totalPicked = lines.reduce((sum, line) => sum + Number(line.picked_qty || 0), 0);
    const totalShortage = lines.reduce((sum, line) => sum + Number(line.shortage_qty || 0), 0);
    columnCount = includeShelfLocation ? 6 : 5;
    tableHead = `
          <tr>
            <th class="col-no">No.</th>
            ${includeShelfLocation ? '<th class="col-shelf">Shelf</th>' : ""}
            <th class="col-product">Product</th>
            <th class="col-qty">Requested</th>
            <th class="col-picked">Picked</th>
            <th class="col-shortage">Shortage</th>
          </tr>`;
    rowHtml =
      buildDistributionPickingLineRows(lines, includeShelfLocation) ||
      `<tr><td colspan="${columnCount}" class="empty">No products to pick</td></tr>`;
    summaryHtml = `
      <div class="summary-box">
        <div class="summary-row"><span>Total requested</span><strong>${formatQty(totalRequired)}</strong></div>
        <div class="summary-row"><span>Total picked</span><strong>${formatQty(totalPicked)}</strong></div>
        <div class="summary-row"><span>Total shortage</span><strong>${formatQty(totalShortage)}</strong></div>
      </div>`;
  }

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
  <title>Picking List ${escapeHtml(listNumber)}</title>
  <style>${pickingListPrintStyles(generalSettings, { salesLayout, includeShelfLocation })}</style>
</head>
<body class="has-doc-print-edge-footer">
  <div class="page">
    <div class="sheet">
      ${orgHeader}
      <div class="title-block">
        <p class="doc-title">Picking List #${escapeHtml(listNumber)}</p>
        <p class="meta-line">Date: ${escapeHtml(dateLabel)}</p>
        ${meta.tripCode ? `<p class="meta-line">Trip chart: ${escapeHtml(meta.tripCode)}</p>` : ""}
        <p class="meta-line">Route: ${escapeHtml(meta.routeNames)}</p>
        ${meta.vehicle ? `<p class="meta-line">Vehicle: ${escapeHtml(meta.vehicle)}</p>` : ""}
        ${meta.driver ? `<p class="meta-line">Driver: ${escapeHtml(meta.driver)}</p>` : ""}
      </div>
      <table>
        <thead>${tableHead}
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>
      ${summaryHtml}
      <div class="signatures">
        <div>
          <h3>Picked by</h3>
          <div class="line">Signature: _________________________</div>
          <div class="line">Name: ${escapeHtml(pickerName || "_________________________")}</div>
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
  </div>
  ${buildDocumentPrintEdgeFooterHtml({
    printedBy: printedByName,
    printedAt,
  })}
</body>
</html>`;
}

export function printPickingList({
  organization = null,
  generalSettings = null,
  organizationName = "Picking List",
  pickingList,
  trip = null,
  documentFooterText = null,
  printedBy = null,
  includeShelfLocation = true,
  uomByProductCode = null,
  layout = null,
} = {}) {
  const html = buildPickingListHtml({
    organization,
    generalSettings,
    organizationName,
    pickingList,
    trip,
    documentFooterText,
    printedBy,
    includeShelfLocation,
    uomByProductCode,
    layout,
  });
  openPrintWindow(html, "width=900,height=800");
}

/** Sample picking list for Admin → Printouts live preview. */
export function samplePickingListPreviewData({ salesLayout = false } = {}) {
  const today = new Date().toISOString().slice(0, 10);
  if (salesLayout) {
    return {
      pickingList: {
        list_number: "PK-20260731-001",
        list_date: today,
        layout: "sales",
        picker_name: "Warehouse",
        order_total_value: 87500,
        route: { route_name: "East Route" },
        lines: [
          {
            product_name: "KAMANDE",
            quantity_label: "10 Bag, 30 kg",
            retail_breakdown: "5 kg ×4, 3 kg ×2, 4 kg ×2",
            price_label: "Ksh 2,250 / Bag · Ksh 48 / kg",
            line_total: 45000,
          },
          {
            product_name: "SUGAR 50 KG",
            quantity_label: "4 Bag",
            retail_breakdown: "",
            price_label: "Ksh 6,000 / Bag",
            line_total: 24000,
          },
          {
            product_name: "RICE BIRIYANI",
            quantity_label: "25 kg",
            retail_breakdown: "10 kg, 5 kg ×3",
            price_label: "Ksh 90 / kg",
            line_total: 18500,
          },
        ],
      },
      trip: {
        trip_code: "PK-20260731-001",
        scheduled_date: today,
        route_names: ["East Route"],
      },
    };
  }

  return {
    pickingList: {
      list_number: "PL-1001",
      list_date: today,
      picker_name: "Warehouse",
      route: { route_name: "East Route" },
      trip: {
        trip_code: "TC-42",
        route_names: ["East Route"],
        vehicle: { plate_number: "KDA 123A" },
        driver: { full_name: "John Driver" },
      },
      lines: [
        {
          product_name: "THAI RICE BIRIYANI",
          required_qty: 20,
          picked_qty: 18,
          shortage_qty: 2,
          shelf_location: "A1",
          pack_breakdown: "20 bag",
        },
        {
          product_name: "SUGAR 50 KG",
          required_qty: 4,
          picked_qty: 4,
          shortage_qty: 0,
          shelf_location: "B3",
          pack_breakdown: "4 bag",
        },
      ],
    },
    trip: {
      trip_code: "TC-42",
      scheduled_date: today,
      route_names: ["East Route"],
      vehicle: { plate_number: "KDA 123A" },
      driver: { full_name: "John Driver" },
    },
  };
}
