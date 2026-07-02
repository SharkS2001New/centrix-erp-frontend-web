import { openPrintWindow } from "@/lib/open-print-window";
import { resolvePrintedByUser } from "@/lib/printed-by-user";
import {
  buildReportWatermarkHtml,
  resolveReportBranding,
} from "@/lib/reports/report-branding";

import { resolveLoadingSheetFooterLines } from "@/lib/loading-sheet-print-settings";
import {
  buildDocumentPrintEdgeFooterHtml,
  documentPrintEdgeFooterStyles,
} from "@/lib/document-print-edge-footer";
import {
  orgPrintFontFamilyFromSettings,
  orgPrintInkStyles,
  orgPrintPx,
} from "@/lib/print-typography";

function formatKes(amount) {
  const n = Number(amount) || 0;
  return n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString("en-KE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
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
  const n = Number(line.unit_price) || 0;
  if (!n) return "";
  return Number.isInteger(n) ? String(Math.trunc(n)) : String(n);
}

/** Sample data with separate wholesale and retail price rows. */
export function sampleLoadingListPreviewData() {
  const lines = [
    {
      line_no: 1,
      product_name: "THAI RICE BIRIYANI",
      quantity_label: "66 bag",
      pack_breakdown: "66 bag",
      unit_price: 2250,
      line_total: 148500,
      on_wholesale_retail: 0,
      price_tier: "wholesale",
    },
    {
      line_no: 2,
      product_name: "BANJAB RICE 25KG",
      quantity_label: "25 bag",
      pack_breakdown: "25 bag",
      unit_price: 2250,
      line_total: 56250,
      on_wholesale_retail: 0,
      price_tier: "wholesale",
    },
    {
      line_no: 3,
      product_name: "SUGAR 50 KG",
      quantity_label: "16 bag",
      pack_breakdown: "16 bag",
      unit_price: 6000,
      line_total: 96000,
      on_wholesale_retail: 0,
      price_tier: "wholesale",
    },
    {
      line_no: 4,
      product_name: "SUGAR 50 KG",
      quantity_label: "4 bag",
      pack_breakdown: "4 bag",
      unit_price: 6200,
      line_total: 24800,
      on_wholesale_retail: 1,
      price_tier: "retail",
    },
    {
      line_no: 5,
      product_name: "MT. KENYA ESL 500ML",
      quantity_label: "10",
      pack_breakdown: "",
      unit_price: 580,
      line_total: 5800,
      on_wholesale_retail: 1,
      price_tier: "retail",
    },
  ];

  return {
    loadingList: {
      list_date: "2026-01-30",
      route: { route_name: "C" },
      prepared_by_name: "Preview",
      checked_by_name: "",
      total_amount: lines.reduce((sum, line) => sum + Number(line.line_total || 0), 0),
      lines,
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

function normalizeLoadingListLines(lines) {
  return (lines ?? []).map((line, index) => {
    const productCode = String(line.product_code ?? "").trim();
    const productName = String(line.product_name ?? "").trim();
    const resolvedName =
      productName && productName !== productCode ? productName : productName || productCode;

    return {
      ...line,
      line_no: line.line_no ?? index + 1,
      product_name: resolvedName,
      quantity_label: line.quantity_label ?? String(line.quantity ?? ""),
      pack_breakdown: line.pack_breakdown ?? "",
    };
  });
}

function buildLoadingListLineRows(lines) {
  return normalizeLoadingListLines(lines)
    .map((line) => {
      const qtyMain = escapeHtml(line.quantity_label || line.quantity);
      const qtyGhost = escapeHtml(quantityGhostText(line));
      const priceMain = `Ksh ${formatKes(line.unit_price)}`;
      const priceGhost = escapeHtml(priceGhostText(line));

      return `
      <tr>
        <td class="col-no">${line.line_no}</td>
        <td class="col-product">${escapeHtml(String(line.product_name ?? "").toUpperCase())}</td>
        <td class="col-qty">
          <div class="main">${qtyMain}</div>
          ${qtyGhost ? `<div class="ghost">${qtyGhost}</div>` : ""}
        </td>
        <td class="col-price">
          <div class="main">${priceMain}</div>
          ${priceGhost ? `<div class="ghost">${priceGhost}</div>` : ""}
        </td>
        <td class="col-total">${formatKes(line.line_total)}</td>
      </tr>`;
    })
    .join("");
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
    .watermark { position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden; }
    .watermark-text {
      position: absolute;
      top: 48%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-32deg);
      font-size: ${px(64)};
      font-weight: 700;
      letter-spacing: 0.04em;
      color: rgba(15, 23, 42, 0.06);
      white-space: nowrap;
    }
    .watermark-logo {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      max-width: 70%;
      max-height: 70%;
      opacity: 0.05;
      object-fit: contain;
    }
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
    thead th.col-total { text-align: right; }
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
      width: 34%;
      text-align: left;
      font-weight: 700;
      text-transform: uppercase;
      padding-right: 12px;
      word-break: break-word;
    }
    .col-qty, .col-price { text-align: left; white-space: nowrap; }
    .col-total { text-align: right; white-space: nowrap; font-weight: 400; }
    .main { font-weight: 700; }
    .ghost { color: #8a8a8a; font-size: ${px(10)}; font-weight: 400; margin-top: 3px; line-height: 1.2; }
    .empty { text-align: center; padding: 24px; color: #666; }
    tfoot td {
      padding: 14px 8px 0;
      border: none;
      font-weight: 700;
      font-size: ${px(13)};
    }
    tfoot .col-total { text-align: right; }
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
      .signatures h3 { font-size: ${px(12, true)}; }
      .signatures .line { font-size: ${px(11, true)}; }
      .doc-footer, .doc-footer-line { font-size: ${px(10, true)}; }
      .watermark-text { color: rgba(15, 23, 42, 0.08); font-size: ${px(64, true)}; }
    }
  `;
}

export function buildLoadingListHtml({
  organization = null,
  generalSettings = null,
  organizationName = "Loading List",
  loadingList,
  trip = null,
  printSettings = null,
  documentFooterText = null,
  footerLines = null,
  printedBy = null,
} = {}) {
  const branding = resolveReportBranding({ organization, generalSettings });
  const orgHeader = buildLoadingListHeaderHtml({
    branding,
    companyName: resolveOrganizationName({ organization, organizationName, branding }),
  });
  const watermark = buildReportWatermarkHtml(branding);
  const companyName = resolveOrganizationName({ organization, organizationName, branding });
  const showSignatures = printSettings?.loading_sheet_show_signatures !== false;

  const lines = normalizeLoadingListLines(loadingList?.lines ?? []);
  const routeName = loadingList?.route?.route_name ?? trip?.route?.route_name ?? "—";
  const listDate = loadingList?.list_date ?? trip?.scheduled_date;
  const preparedBy = loadingList?.prepared_by_name ?? trip?.prepared_by_name ?? "";
  const checkedBy =
    loadingList?.checked_by_name ??
    trip?.checked_by_name ??
    printSettings?.loading_sheet_default_checked_by ??
    "";
  const total =
    loadingList?.total_amount ?? lines.reduce((sum, line) => sum + Number(line.line_total || 0), 0);
  const dateLabel = formatDisplayDate(listDate);
  const rowHtml =
    buildLoadingListLineRows(lines) ||
    '<tr><td colspan="5" class="empty">No line items</td></tr>';

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
    ? `<div class="doc-footer">${escapeHtml(footerText)}</div>`
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
      <p class="route-name">Route Name: ${escapeHtml(routeName)}</p>
    </div>
    <table>
      <thead>
        <tr>
          <th class="col-no">No.</th>
          <th class="col-product">Product Name</th>
          <th class="col-qty">Total Items<br/>(Breakdown in Packages)</th>
          <th class="col-price">Price (R/W)</th>
          <th class="col-total">Line Total</th>
        </tr>
      </thead>
      <tbody>${rowHtml}</tbody>
      <tfoot>
        <tr>
          <td colspan="4" style="text-align:right;">TOTAL</td>
          <td class="col-total">${formatKes(total)}</td>
        </tr>
      </tfoot>
    </table>
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
  printSettings = null,
  documentFooterText = null,
  printedBy = null,
} = {}) {
  const html = buildLoadingListHtml({
    organization,
    generalSettings,
    organizationName,
    loadingList,
    trip,
    printSettings,
    documentFooterText,
    printedBy,
  });
  openPrintWindow(html, "width=900,height=800");
}
