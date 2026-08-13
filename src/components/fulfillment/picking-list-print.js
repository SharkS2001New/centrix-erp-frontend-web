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

/** CSS grid tracks — block rows (not <tr>) so Chromium honors break-inside:avoid. */
function salesPickingGridColumns() {
  // Give Line amount more than the old 17% so 1,234,567.89 is not clipped.
  return "5% 26% 22% 24% 23%";
}

function distributionPickingGridColumns(includeShelfLocation = true) {
  return includeShelfLocation ? "5% 12% 34% 13% 13% 13%" : "5% 46% 13% 13% 13%";
}

function buildSalesPickingHead() {
  return `
    <div class="pick-head" role="row">
      <div class="col-no">No.</div>
      <div class="col-product">Product Name</div>
      <div class="col-qty">Quantity</div>
      <div class="col-price">Price</div>
      <div class="col-total">Line amount</div>
    </div>`;
}

function buildDistributionPickingHead(includeShelfLocation = true) {
  return `
    <div class="pick-head" role="row">
      <div class="col-no">No.</div>
      ${includeShelfLocation ? '<div class="col-shelf">Shelf</div>' : ""}
      <div class="col-product">Product</div>
      <div class="col-qty">Requested</div>
      <div class="col-picked">Picked</div>
      <div class="col-shortage">Shortage</div>
    </div>`;
}

function buildDistributionPickingLineRows(lines, includeShelfLocation = true) {
  return lines
    .map((line) => {
      const hasShortage = Number(line.shortage_qty) > 0.0001;
      const shortageClass = hasShortage ? " shortage" : "";
      const shelfCell = includeShelfLocation
        ? `<div class="col-shelf">${escapeHtml(line.shelf_location)}</div>`
        : "";

      // Block wrapper: Chromium clips <table>/<tr> at page edges even with break-inside:avoid.
      return `
      <div class="pick-line-wrap">
        <div class="pick-line${shortageClass}" role="row">
          <div class="col-no">${line.line_no}</div>
          ${shelfCell}
          <div class="col-product">
            <div class="main">${escapeHtml(String(line.product_name ?? "").toUpperCase())}</div>
          </div>
          <div class="col-qty">${escapeHtml(line.quantity_label)}</div>
          <div class="col-picked">${escapeHtml(line.picked_label)}</div>
          <div class="col-shortage">${line.shortage_qty > 0.0001 ? escapeHtml(line.shortage_label) : "—"}</div>
        </div>
      </div>`;
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
      <div class="pick-line-wrap">
        <div class="pick-line" role="row">
          <div class="col-no">${line.line_no}</div>
          <div class="col-product">
            <div class="main">${escapeHtml(String(line.product_name ?? "").toUpperCase())}</div>
          </div>
          <div class="col-qty">
            <div class="main">${escapeHtml(line.quantity_label)}</div>
            ${qtyGhost}
          </div>
          <div class="col-price">${priceMain}</div>
          <div class="col-total">${formatKes(line.line_total)}</div>
        </div>
      </div>`;
    })
    .join("");
}

/** Soft upper bound only — real paging uses estimated row height vs A4 usable space. */
export const PICKING_LIST_LINES_PER_PAGE = 40;

/**
 * A4 line-area budgets (mm) after page chrome (header / continued label / column head).
 * The 30mm edge footer is a fixed overlay — do not subtract it from this flowing
 * line area or pages stop early with a large blank band. Trim only ~1 row from the
 * previous 210 / 258 values so the last line cannot spill onto a nearly empty sheet.
 */
export const PICKING_LIST_PAGE_BUDGET_MM = {
  /** Line area after org header + title + column head on page 1. */
  first: 205,
  /** Line area after continued label + column head on later pages. */
  continued: 254,
  /** Summary box + signature blocks reserved on the last page only. */
  summaryReserve: 52,
  /** Extra empty margin after the last item on a page (~½ row). */
  bottomSafety: 4,
};

/** Estimate print height of one picking row from its content (taller when multi-line). */
export function estimatePickingLineHeightMm(line) {
  let textLines = 1;
  if (String(line?.retail_breakdown ?? "").trim()) textLines += 1;
  const qty = String(line?.quantity_label ?? "").trim();
  if (qty.length > 32) textLines += 1;
  const price = String(line?.price_label ?? "").trim();
  if (price.length > 40) textLines += 1;
  const name = String(line?.product_name ?? "").trim();
  if (name.length > 34) textLines += 1;
  // Single-line row: 8px padding × 2 + 11px type + hairline ≈ 7.2mm.
  return 7.2 + Math.max(0, textLines - 1) * 3.4;
}

function sumEstimatedPickingHeightMm(lines) {
  return (lines ?? []).reduce((sum, line) => sum + estimatePickingLineHeightMm(line), 0);
}

/**
 * Pack lines onto A4 pages by estimated height: fill until the next item would not fit,
 * then start a new page. Not a fixed item count — short rows pack denser than tall ones.
 */
export function chunkPickingLinesForPrint(lines, options = {}) {
  const rows = Array.isArray(lines) ? lines : [];
  if (rows.length === 0) return [[]];

  const firstBudget = Number(options.firstBudgetMm ?? PICKING_LIST_PAGE_BUDGET_MM.first);
  const continuedBudget = Number(options.continuedBudgetMm ?? PICKING_LIST_PAGE_BUDGET_MM.continued);
  const summaryReserve = Number(options.summaryReserveMm ?? PICKING_LIST_PAGE_BUDGET_MM.summaryReserve);
  const bottomSafety = Number(options.bottomSafetyMm ?? PICKING_LIST_PAGE_BUDGET_MM.bottomSafety);

  const pages = [];
  let index = 0;
  let pageIndex = 0;

  while (index < rows.length) {
    const fullBudget =
      (pageIndex === 0 ? firstBudget : continuedBudget) - bottomSafety;
    const chunk = [];
    let used = 0;

    while (index < rows.length) {
      const line = rows[index];
      const height = estimatePickingLineHeightMm(line);
      const remainingAfter = rows.slice(index + 1);
      const remainingHeight = sumEstimatedPickingHeightMm(remainingAfter);
      // Reserve summary only when this page can finish the list — must include
      // height already used. Ignoring `used` stopped packing early and left
      // large blank regions on non-final pages.
      const restWithThis = height + remainingHeight;
      const fitsAsLastPage = used + restWithThis + summaryReserve <= fullBudget;
      const budget = fitsAsLastPage ? fullBudget - summaryReserve : fullBudget;

      if (chunk.length > 0 && used + height > budget) {
        break;
      }
      chunk.push(line);
      used += height;
      index += 1;
    }

    if (chunk.length === 0) {
      // Pathological oversized row — still emit it alone so printing never stalls.
      chunk.push(rows[index]);
      index += 1;
    }
    pages.push(chunk);
    pageIndex += 1;
  }

  return pages;
}

function pickingListPrintStyles(
  generalSettings,
  { salesLayout = false, includeShelfLocation = true } = {},
) {
  const printPx = createOrgPrintPx(generalSettings, "picking_list");
  const px = printPx.body;
  const fontFamily = orgPrintFontFamilyFromSettings(generalSettings, "picking_list");
  const gridColumns = salesLayout
    ? salesPickingGridColumns()
    : distributionPickingGridColumns(includeShelfLocation);
  const sharedPrintLayout = `
    @page { size: A4; margin: 0; }
    html { height: auto; }
    /* Screen preview is a physical A4 sheet. Print uses 100% of the padded body
       (12mm sides) so the Line amount column is not clipped past 210mm. */
    .print-page {
      width: 210mm;
      max-width: 100%;
      box-sizing: border-box;
      padding: ${px(24)};
      /* Stay inside A4 minus the 30mm document edge footer. */
      padding-bottom: 6mm;
      overflow: visible;
      page-break-after: always;
      break-after: page;
    }
    .print-page:last-of-type {
      page-break-after: auto;
      break-after: auto;
    }
    .page, .sheet, .print-page { position: static; z-index: 1; overflow: visible; }
    .pick-lines {
      width: 100%;
      display: block;
      overflow: visible;
    }
    .pick-head,
    .pick-line {
      display: grid;
      grid-template-columns: ${gridColumns};
      width: 100%;
      column-gap: 0;
      align-items: start;
      box-sizing: border-box;
    }
    /* Block wraps beat <table>/<tr> for Chromium print fragmentation. */
    .pick-line-wrap {
      display: block;
      width: 100%;
      overflow: visible;
      break-inside: avoid;
      page-break-inside: avoid;
      break-inside: avoid-page;
      -webkit-column-break-inside: avoid;
    }
    .pick-head {
      break-after: avoid;
      page-break-after: avoid;
    }
    .summary-box,
    .signatures,
    .doc-footer {
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .continued-label {
      font-size: ${px(11)};
      color: #64748b;
      margin: 0 0 ${px(8)};
    }
  `;

  if (salesLayout) {
    return `
    ${orgPrintInkStyles(generalSettings, "picking_list")}
    ${documentPrintEdgeFooterStyles(generalSettings, { variant: "picking_list" })}
    ${sharedPrintLayout}
    * { box-sizing: border-box; }
    body { margin: 0; font-family: ${fontFamily}; color: #0f172a; font-size: ${px(12)}; }
    .org-header { text-align: center; margin-bottom: ${px(12)}; }
    .org-logo { max-height: ${px(48)}; margin-bottom: ${px(6)}; }
    .org-name { font-size: ${px(16)}; font-weight: 700; letter-spacing: 0.04em; }
    .title-block { text-align: center; margin-bottom: ${px(16)}; }
    .doc-title { font-size: ${px(15)}; font-weight: 700; margin: 0 0 ${px(4)}; }
    .meta-line { font-size: ${px(12)}; margin: ${px(2)} 0; color: #334155; }
    .pick-head,
    .pick-line { font-size: ${px(12)}; }
    .pick-head {
      border-bottom: 2px solid #0f172a;
      padding: ${px(8)} 0;
      font-weight: 700;
    }
    .pick-head > div { padding: 0 ${px(6)}; }
    .pick-line {
      border-bottom: 1px solid #cbd5e1;
      padding: ${px(8)} 0;
    }
    .pick-line > div { padding: 0 ${px(6)}; }
    .col-no { text-align: center; }
    .col-price { overflow-wrap: break-word; }
    .col-total {
      text-align: right;
      white-space: nowrap;
      overflow: visible;
      font-variant-numeric: tabular-nums;
    }
    .ghost { font-size: ${px(10)}; color: #64748b; margin-top: ${px(2)}; line-height: 1.35; max-width: ${px(220)}; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: ${px(24)}; margin-top: ${px(24)}; }
    .signatures h3 { font-size: ${px(12)}; margin: 0 0 ${px(8)}; }
    .signatures .line { font-size: ${px(11)}; margin: ${px(6)} 0; }
    .summary-box { margin-top: ${px(16)}; padding: ${px(12)}; border: 1px solid #cbd5e1; border-radius: ${px(6)}; }
    .summary-row { display: flex; justify-content: space-between; font-size: ${px(13)}; margin: ${px(4)} 0; font-weight: 600; }
    .empty { text-align: center; color: #64748b; padding: ${px(16)}; }
    @media print {
      body.has-doc-print-edge-footer {
        padding: ${DOCUMENT_PRINT_EDGE_BODY_TOP} ${DOCUMENT_PRINT_EDGE_BODY_SIDES} ${DOCUMENT_PRINT_EDGE_BODY_BOTTOM} ${DOCUMENT_PRINT_EDGE_BODY_SIDES} !important;
      }
      body { font-size: ${px(12, true)}; }
      .print-page {
        width: 100% !important;
        max-width: 100% !important;
        padding: ${px(8, true)} ${px(4, true)} 8mm;
        page-break-after: always !important;
        break-after: page !important;
      }
      .print-page:last-of-type {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      .pick-head { font-size: ${px(11, true)}; }
      .pick-line { font-size: ${px(11, true)}; }
      .pick-line-wrap {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        break-inside: avoid-page !important;
        -webkit-column-break-inside: avoid !important;
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
    .org-header { text-align: center; margin-bottom: ${px(12)}; }
    .org-logo { max-height: ${px(48)}; margin-bottom: ${px(6)}; }
    .org-name { font-size: ${px(16)}; font-weight: 700; letter-spacing: 0.04em; }
    .title-block { text-align: center; margin-bottom: ${px(16)}; }
    .doc-title { font-size: ${px(15)}; font-weight: 700; margin: 0 0 ${px(4)}; }
    .meta-line { font-size: ${px(12)}; margin: ${px(2)} 0; color: #334155; }
    .pick-head,
    .pick-line { font-size: ${px(12)}; }
    .pick-head {
      border-bottom: 2px solid #0f172a;
      padding: ${px(8)} 0;
      font-weight: 700;
    }
    .pick-head > div { padding: 0 ${px(6)}; }
    .pick-line {
      border-bottom: 1px solid #cbd5e1;
      padding: ${px(8)} 0;
    }
    .pick-line > div { padding: 0 ${px(6)}; }
    .col-no { text-align: center; }
    .col-qty, .col-picked, .col-shortage { text-align: right; }
    .ghost { font-size: ${px(10)}; color: #64748b; margin-top: ${px(2)}; }
    .pick-line.shortage { background: #fff7ed; }
    .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: ${px(24)}; margin-top: ${px(24)}; }
    .signatures h3 { font-size: ${px(12)}; margin: 0 0 ${px(8)}; }
    .signatures .line { font-size: ${px(11)}; margin: ${px(6)} 0; }
    .summary-box { margin-top: ${px(16)}; padding: ${px(12)}; border: 1px solid #cbd5e1; border-radius: ${px(6)}; }
    .summary-row { display: flex; justify-content: space-between; font-size: ${px(12)}; margin: ${px(4)} 0; }
    .empty { text-align: center; color: #64748b; padding: ${px(16)}; }
    @media print {
      body.has-doc-print-edge-footer {
        padding: ${DOCUMENT_PRINT_EDGE_BODY_TOP} ${DOCUMENT_PRINT_EDGE_BODY_SIDES} ${DOCUMENT_PRINT_EDGE_BODY_BOTTOM} ${DOCUMENT_PRINT_EDGE_BODY_SIDES} !important;
      }
      body { font-size: ${px(12, true)}; }
      .print-page {
        width: 100% !important;
        max-width: 100% !important;
        padding: ${px(8, true)} ${px(4, true)} 8mm;
        page-break-after: always !important;
        break-after: page !important;
      }
      .print-page:last-of-type {
        page-break-after: auto !important;
        break-after: auto !important;
      }
      .pick-head { font-size: ${px(11, true)}; }
      .pick-line { font-size: ${px(11, true)}; }
      .pick-line-wrap {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        break-inside: avoid-page !important;
        -webkit-column-break-inside: avoid !important;
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

  let tableHead;
  let summaryHtml;

  if (salesLayout) {
    tableHead = buildSalesPickingHead();
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
    tableHead = buildDistributionPickingHead(includeShelfLocation);
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

  const linesBlockForChunk = (chunkLines) => {
    const chunkRows = salesLayout
      ? buildSalesPickingLineRows(chunkLines)
      : buildDistributionPickingLineRows(chunkLines, includeShelfLocation);
    return chunkRows
      ? `<div class="pick-lines">${chunkRows}</div>`
      : `<div class="pick-line-wrap"><div class="pick-line empty">No products to pick</div></div>`;
  };

  const pageChunks = chunkPickingLinesForPrint(lines);
  const totalPages = pageChunks.length;

  const titleBlockHtml = `
      <div class="title-block">
        <p class="doc-title">${escapeHtml(docTitle)}</p>
        <p class="meta-line">Date: ${escapeHtml(dateLabel)}</p>
        ${meta.tripCode && !meta.combined ? `<p class="meta-line">Trip chart: ${escapeHtml(meta.tripCode)}</p>` : ""}
        ${showRouteMetaLine ? `<p class="meta-line">Route: ${escapeHtml(meta.routeNames)}</p>` : ""}
        ${meta.vehicle ? `<p class="meta-line">Vehicle: ${escapeHtml(meta.vehicle)}</p>` : ""}
        ${meta.driver ? `<p class="meta-line">Driver: ${escapeHtml(meta.driver)}</p>` : ""}
      </div>`;

  const pagesHtml = pageChunks
    .map((chunk, pageIndex) => {
      const isFirst = pageIndex === 0;
      const isLast = pageIndex === totalPages - 1;
      const pageLabel =
        totalPages > 1
          ? `<p class="continued-label">${
              isFirst
                ? `Page ${pageIndex + 1} of ${totalPages}`
                : `${escapeHtml(docTitle)} — continued · Page ${pageIndex + 1} of ${totalPages}`
            }</p>`
          : "";
      return `
  <div class="print-page">
    <div class="sheet">
      ${isFirst ? orgHeader : ""}
      ${isFirst ? titleBlockHtml : ""}
      ${pageLabel}
      ${tableHead}
      ${linesBlockForChunk(chunk)}
      ${isLast ? summaryHtml : ""}
      ${
        isLast
          ? `<div class="signatures">
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
      </div>`
          : ""
      }
      ${isLast ? footerHtml : ""}
    </div>
  </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(docTitle)}</title>
  <style>${pickingListPrintStyles(generalSettings, { salesLayout, includeShelfLocation })}</style>
</head>
<body class="has-doc-print-edge-footer">
  ${pagesHtml}
  ${buildDocumentPrintEdgeFooterHtml({
    printedBy: printedByName,
    printedAt,
    // Fixed footers repeat on every sheet — use CSS page counters when multi-page.
    pageLabel: totalPages > 1 ? "auto" : "Page 1 of 1",
  })}
</body>
</html>`;
}

export async function printPickingList({
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
  return printHtmlDocument(html, {
    jobType: "picking_list",
    documentId: pickingList?.id ?? pickingList?.list_number ?? null,
    windowFeatures: "width=900,height=800",
  });
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
