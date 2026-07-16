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
  return buildReportOrgHeaderHtml(branding);
}

function normalizePickingLines(lines, uomByProductCode) {
  return (lines ?? []).map((line, index) => {
    const required = Number(line.required_qty ?? line.quantity ?? 0);
    const picked = Number(line.picked_qty ?? required);
    const shortage = Math.max(0, Number(line.shortage_qty ?? required - picked));
    const requestedLabel = formatFulfillmentQty(required, line, uomByProductCode);
    const pickedLabel = formatFulfillmentQty(picked, line, uomByProductCode);
    const shortageLabel = shortage > 0 ? formatFulfillmentQty(shortage, line, uomByProductCode) : "—";

    return {
      ...line,
      line_no: line.line_no ?? index + 1,
      shelf_location: line.shelf_location || "—",
      stock_location: line.stock_location || "store",
      required_qty: required,
      picked_qty: picked,
      shortage_qty: shortage,
      quantity_label: requestedLabel,
      picked_label: pickedLabel,
      shortage_label: shortageLabel,
      pack_breakdown:
        line.pack_breakdown && line.pack_breakdown !== requestedLabel ? line.pack_breakdown : "",
    };
  });
}

function buildPickingLineRows(lines, includeShelfLocation = true, uomByProductCode) {
  return normalizePickingLines(lines, uomByProductCode)
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
          ${line.pack_breakdown ? `<div class="ghost">${escapeHtml(line.pack_breakdown)}</div>` : ""}
        </td>
        <td class="col-qty">${escapeHtml(line.quantity_label)}</td>
        <td class="col-picked">${escapeHtml(line.picked_label)}</td>
        <td class="col-shortage">${line.shortage_qty > 0.0001 ? escapeHtml(line.shortage_label) : "—"}</td>
      </tr>`;
    })
    .join("");
}

function pickingListPrintStyles(generalSettings, includeShelfLocation = true) {
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
} = {}) {
  const branding = resolveReportBranding({ organization, generalSettings, organizationNameFallback: organizationName });
  const orgHeader = buildPickingListHeaderHtml({ branding });
  const lines = normalizePickingLines(pickingList?.lines ?? [], uomByProductCode);
  const meta = resolveRouteHeader({ pickingList, trip });
  const listDate = pickingList?.list_date ?? trip?.scheduled_date;
  const dateLabel = formatPrintDisplayDate(listDate, { emptyLabel: "—" });
  const listNumber = pickingList?.list_number ?? "—";
  const pickerName = pickingList?.picker_name ?? "";
  const totalRequired = lines.reduce((sum, line) => sum + Number(line.required_qty || 0), 0);
  const totalPicked = lines.reduce((sum, line) => sum + Number(line.picked_qty || 0), 0);
  const totalShortage = lines.reduce((sum, line) => sum + Number(line.shortage_qty || 0), 0);
  const columnCount = includeShelfLocation ? 6 : 5;
  const rowHtml =
    buildPickingLineRows(lines, includeShelfLocation, uomByProductCode) ||
    `<tr><td colspan="${columnCount}" class="empty">No products to pick</td></tr>`;

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
  <style>${pickingListPrintStyles(generalSettings, includeShelfLocation)}</style>
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
        <thead>
          <tr>
            <th class="col-no">No.</th>
            ${includeShelfLocation ? '<th class="col-shelf">Shelf</th>' : ""}
            <th class="col-product">Product</th>
            <th class="col-qty">Requested</th>
            <th class="col-picked">Picked</th>
            <th class="col-shortage">Shortage</th>
          </tr>
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>
      <div class="summary-box">
        <div class="summary-row"><span>Total requested</span><strong>${formatQty(totalRequired)}</strong></div>
        <div class="summary-row"><span>Total picked</span><strong>${formatQty(totalPicked)}</strong></div>
        <div class="summary-row"><span>Total shortage</span><strong>${formatQty(totalShortage)}</strong></div>
      </div>
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
  });
  openPrintWindow(html, "width=900,height=800");
}
