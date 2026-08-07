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

/** Strip legacy W/R prefixes from quantity labels ("W 3 Bag" → "3 Bag"). */
export function cleanPickingQuantityLabel(label) {
  const raw = String(label ?? "").trim();
  if (!raw) return "";
  return raw
    .replace(/\bW\s+/g, "")
    .replace(/\bR\s+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Normalize legacy price text toward "2,250 per bag, 52 per kg". */
export function cleanPickingPriceLabel(label) {
  const raw = String(label ?? "").trim();
  if (!raw) return "";

  function extractAmounts(text) {
    const matches = String(text).match(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g) ?? [];
    return matches
      .map((n) => formatPickingPriceAmount(Number(String(n).replace(/,/g, ""))))
      .filter(Boolean)
      .join(", ");
  }

  return raw
    .split(/\s*·\s*/)
    .map((part) => {
      let text = part
        .replace(/^W\s+/i, "")
        .replace(/^R\s+/i, "")
        .replace(/^Ksh\s+/i, "")
        .trim();
      const slash = text.match(/^(.+?)\s*\/\s*(.+)$/i);
      if (slash) {
        const amounts = extractAmounts(slash[1]);
        const unit = String(slash[2]).trim().toLowerCase();
        return amounts ? `${amounts} per ${unit}` : "";
      }
      const per = text.match(/^(.+?)\s+per\s+(.+)$/i);
      if (per) {
        const amounts = extractAmounts(per[1]);
        const unit = String(per[2]).trim().toLowerCase();
        return amounts ? `${amounts} per ${unit}` : "";
      }
      const amountsOnly = extractAmounts(text);
      if (amountsOnly && amountsOnly === formatPickingPriceAmount(Number(text.replace(/,/g, "")))) {
        return amountsOnly;
      }
      if (/^[\d,]+(?:\.\d+)?$/.test(text)) {
        return formatPickingPriceAmount(Number(text.replace(/,/g, "")));
      }
      return text;
    })
    .filter(Boolean)
    .join(", ");
}

function formatPickingPriceAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return "";
  return Math.round(n).toLocaleString("en-KE");
}

function formatPickingPriceList(prices) {
  return (prices ?? [])
    .map((price) => formatPickingPriceAmount(price))
    .filter(Boolean)
    .join(", ");
}

function pickingPackUnit(line, kind) {
  if (kind === "wholesale") {
    const explicit = String(line?.wholesale_pack_label ?? "").trim();
    if (explicit) return explicit.toLowerCase();
    const qty = String(line?.wholesale_qty_label || line?.quantity_label || "");
    const match = qty.match(/\d[\d,]*(?:\.\d+)?\s+([A-Za-z]+)/);
    return (match?.[1] || "bag").toLowerCase();
  }
  const explicit = String(line?.retail_pack_label ?? "").trim();
  if (explicit) return explicit.toLowerCase();
  const qty = String(line?.retail_qty_label || line?.quantity_label || "");
  const match = qty.match(/(?:^|,\s*)\d[\d,]*(?:\.\d+)?\s+([A-Za-z]+)\s*$/);
  return (match?.[1] || "kg").toLowerCase();
}

/** Wholesale then retail — e.g. "2,250 per bag, 52 per kg". */
export function formatPickingPriceLabel(line) {
  const wholesalePrices = Array.isArray(line?.wholesale_unit_prices)
    ? line.wholesale_unit_prices
    : Number(line?.wholesale_unit_price) > 0
      ? [line.wholesale_unit_price]
      : [];
  const retailPrices = Array.isArray(line?.retail_unit_prices)
    ? line.retail_unit_prices
    : Number(line?.retail_unit_price) > 0
      ? [line.retail_unit_price]
      : [];

  const parts = [];
  const wholesaleText = formatPickingPriceList(wholesalePrices);
  const retailText = formatPickingPriceList(retailPrices);
  if (wholesaleText) {
    parts.push(`${wholesaleText} per ${pickingPackUnit(line, "wholesale")}`);
  }
  if (retailText) {
    parts.push(`${retailText} per ${pickingPackUnit(line, "retail")}`);
  }
  if (parts.length) return parts.join(", ");

  return cleanPickingPriceLabel(line?.price_label ?? "");
}

/** Strip customer names from legacy retail breakdown ("Jane 20 kg" → "20 kg"). */
export function cleanRetailBreakdown(breakdown) {
  const raw = String(breakdown ?? "").trim();
  if (!raw) return "";
  return raw
    .split(/,\s*/)
    .map((part) => {
      const trimmed = part.trim();
      const match = trimmed.match(/(\d[\d,]*(?:\.\d+)?\s+[a-zA-Z]+)\s*$/);
      return match ? match[1] : trimmed;
    })
    .filter(Boolean)
    .join(", ");
}

/** Leading package count from labels like "W 26 Jer" / "W 4 Bag, R 10 kg". */
export function primaryPackageCountFromLine(line) {
  const label = String(line?.quantity_label ?? line?.wholesale_qty_label ?? "").trim();
  const match = label.match(/(?:^|,\s*)(?:W\s+|R\s+)?([\d,]+(?:\.\d+)?)/i);
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
  const fromList =
    Array.isArray(pickingList?.route_names) && pickingList.route_names.length
      ? pickingList.route_names
      : Array.isArray(pickingList?.trip?.route_names) && pickingList.trip.route_names.length
        ? pickingList.trip.route_names
        : null;
  const fromTrip =
    Array.isArray(trip?.route_names) && trip.route_names.length ? trip.route_names : null;
  const names =
    fromList ??
    (pickingList?.route?.route_name ? [pickingList.route.route_name] : null) ??
    (trip?.route?.route_name ? [trip.route.route_name] : null) ??
    fromTrip ??
    [];

  const routeNamesPhrase =
    String(pickingList?.route_names_phrase ?? "").trim() ||
    formatRouteNamesPhrase(names);
  const routeNames = routeNamesPhrase || "—";

  const tripCode = trip?.trip_code ?? pickingList?.trip?.trip_code ?? null;
  const vehicle =
    trip?.vehicle?.plate_number ??
    trip?.vehicle?.vehicle_name ??
    pickingList?.trip?.vehicle?.plate_number ??
    null;
  const driver = trip?.driver?.full_name ?? pickingList?.trip?.driver?.full_name ?? null;
  const combined = Boolean(pickingList?.combined) || names.length > 1;

  return { routeNames, routeNamesPhrase, tripCode, vehicle, driver, combined, routeNameList: names };
}

/** "Route A and Route B" / "Route 1, 2 and C". */
export function formatRouteNamesPhrase(names) {
  const cleaned = [...new Set((names ?? []).map((n) => String(n ?? "").trim()).filter(Boolean))];
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  if (cleaned.length === 2) return `${cleaned[0]} and ${cleaned[1]}`;
  return `${cleaned.slice(0, -1).join(", ")} and ${cleaned[cleaned.length - 1]}`;
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

    const quantityLabel = cleanPickingQuantityLabel(
      String(line.quantity_label ?? "").trim() ||
        [line.wholesale_qty_label, line.retail_qty_label].filter(Boolean).join(", ") ||
        requestedLabel,
    );

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
      retail_breakdown: cleanRetailBreakdown(line.retail_breakdown ?? ""),
      price_label: formatPickingPriceLabel(line),
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
  const sharedPrintLayout = `
    @page { size: A4; margin: 0; }
    html { height: auto; }
    .sheet { position: static; z-index: 1; }
    table { page-break-inside: auto; }
    thead { display: table-header-group; }
    tbody tr {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .summary-box,
    .signatures,
    .doc-footer {
      page-break-inside: avoid;
      break-inside: avoid;
    }
  `;

  if (salesLayout) {
    return `
    ${orgPrintInkStyles(generalSettings, "picking_list")}
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "picking_list" })}
    ${sharedPrintLayout}
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
    .ghost { font-size: ${px(10)}; color: #64748b; margin-top: ${px(2)}; line-height: 1.35; max-width: ${px(220)}; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: ${px(24)}; margin-top: ${px(24)}; }
    .signatures h3 { font-size: ${px(12)}; margin: 0 0 ${px(8)}; }
    .signatures .line { font-size: ${px(11)}; margin: ${px(6)} 0; }
    .summary-box { margin-top: ${px(16)}; padding: ${px(12)}; border: 1px solid #cbd5e1; border-radius: ${px(6)}; }
    .summary-row { display: flex; justify-content: space-between; font-size: ${px(13)}; margin: ${px(4)} 0; font-weight: 600; }
    .empty { text-align: center; color: #64748b; padding: ${px(16)}; }
    @media print {
      body { font-size: ${px(12, true)}; }
      .page { padding: ${px(8, true)} ${px(4, true)} 0; }
      thead th { font-size: ${px(11, true)}; }
      tbody td { font-size: ${px(11, true)}; }
      tbody tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
  `;
  }

  return `
    ${orgPrintInkStyles(generalSettings, "picking_list")}
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "picking_list" })}
    ${sharedPrintLayout}
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
      .page { padding: ${px(8, true)} ${px(4, true)} 0; }
      thead th { font-size: ${px(11, true)}; }
      tbody td { font-size: ${px(11, true)}; }
      tbody tr {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
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
  const docTitle = meta.combined
    ? `Picking List for ${meta.routeNamesPhrase || meta.routeNames}`
    : `Picking List #${listNumber}`;
  const showRouteMetaLine = !meta.combined;

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
            <th class="col-qty">Quantity</th>
            <th class="col-price">Price</th>
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
  <title>${escapeHtml(docTitle)}</title>
  <style>${pickingListPrintStyles(generalSettings, { salesLayout, includeShelfLocation })}</style>
</head>
<body class="has-doc-print-edge-footer">
  <div class="page">
    <div class="sheet">
      ${orgHeader}
      <div class="title-block">
        <p class="doc-title">${escapeHtml(docTitle)}</p>
        <p class="meta-line">Date: ${escapeHtml(dateLabel)}</p>
        ${meta.tripCode && !meta.combined ? `<p class="meta-line">Trip chart: ${escapeHtml(meta.tripCode)}</p>` : ""}
        ${showRouteMetaLine ? `<p class="meta-line">Route: ${escapeHtml(meta.routeNames)}</p>` : ""}
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
            retail_breakdown: "12 kg, 10 kg, 8 kg",
            price_label: "2,250 per bag, 48 per kg",
            wholesale_pack_label: "Bag",
            retail_pack_label: "kg",
            wholesale_unit_prices: [2250],
            retail_unit_prices: [48],
            line_total: 45000,
          },
          {
            product_name: "SUGAR 50 KG",
            quantity_label: "4 Bag",
            retail_breakdown: "",
            price_label: "6,000 per bag",
            wholesale_pack_label: "Bag",
            wholesale_unit_prices: [6000],
            line_total: 24000,
          },
          {
            product_name: "RICE BIRIYANI",
            quantity_label: "25 kg",
            retail_breakdown: "10 kg, 5 kg, 5 kg, 5 kg",
            price_label: "90 per kg",
            retail_pack_label: "kg",
            retail_unit_prices: [90],
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
