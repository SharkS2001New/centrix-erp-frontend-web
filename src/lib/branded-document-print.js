import { openPrintWindow } from "@/lib/open-print-window";
import {
  buildDocumentPrintEdgeFooterHtml,
  documentPrintEdgeFooterStyles,
  DOCUMENT_PRINT_EDGE_BOTTOM_MARGIN,
} from "@/lib/document-print-edge-footer";
import {
  orgPrintFontFamilyFromSettings,
  orgPrintPx,
} from "@/lib/print-typography";
import {
  buildReportOrgHeaderHtml,
  buildReportWatermarkHtml,
  resolveReportBranding,
} from "@/lib/reports/report-branding";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatDocAmount(value) {
  if (value == null || value === "") return "—";
  return Number(value).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDocQty(value) {
  return Number(value ?? 0).toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatDocDate(value) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function resolveDocumentBranding({ organization = null, generalSettings = null } = {}) {
  return resolveReportBranding({ organization, generalSettings });
}

export function buildOrgContactLines(organization) {
  const phones = [organization?.primary_tel, organization?.secondary_tel].filter(Boolean).join(" / ");
  return {
    address: organization?.org_address ?? "",
    email: organization?.org_email ?? "",
    phones,
    pin: organization?.org_pin ?? "",
  };
}

export function brandedDocumentStyles(generalSettings = null) {
  const px = (base, print = false) => orgPrintPx(base, generalSettings, { variant: "a4", print });
  const font = orgPrintFontFamilyFromSettings(generalSettings);
  return `
  @page { size: A4; margin: 8mm 10mm ${DOCUMENT_PRINT_EDGE_BOTTOM_MARGIN} 10mm; }
  html { height: 100%; }
  body {
    font-family: ${font};
    margin: 0;
    padding: 12px 16px;
    color: #000;
    font-size: ${px(10)};
    line-height: 1.3;
    position: relative;
    min-height: 100%;
    box-sizing: border-box;
  }
  .page {
    max-width: 820px;
    margin: 0 auto;
    position: relative;
    z-index: 1;
  }
  .page-body { }
  .org-header { text-align: center; margin-bottom: 6px; padding-bottom: 0; border-bottom: none; }
  .org-logo { display: block; margin: 0 auto 4px; max-height: 56px; max-width: 220px; object-fit: contain; }
  .org-name { font-size: ${px(18)}; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }
  .org-meta { text-align: center; font-size: ${px(9)}; margin-top: 2px; }
  .doc-title { text-align: center; font-size: ${px(13)}; font-weight: 700; margin: 8px 0; letter-spacing: 0.06em; }
  .meta-block { margin-bottom: 8px; }
  .meta-block p { margin: 1px 0; }
  .meta-label { font-weight: 700; }
  .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin-bottom: 8px; }
  .party-name { font-size: ${px(11)}; font-weight: 700; text-transform: uppercase; margin-bottom: 3px; }
  table.doc-items { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: ${px(9)}; position: relative; z-index: 1; }
  table.doc-items th, table.doc-items td {
    border-top: 1px dotted #000;
    border-bottom: 1px dotted #000;
    padding: 3px 5px;
    vertical-align: top;
  }
  table.doc-items th { font-weight: 700; text-align: left; }
  table.doc-items th.num, table.doc-items td.num { text-align: right; white-space: nowrap; }
  .totals-row { display: flex; justify-content: flex-end; margin: 4px 0 8px; font-size: ${px(10)}; }
  .totals-box { min-width: 220px; text-align: right; }
  .totals-box p { margin: 2px 0; }
  .reason-row { display: flex; justify-content: space-between; gap: 12px; margin: 8px 0; font-size: ${px(10)}; }
  .reason-row .meta-label { flex-shrink: 0; }
  .signatures { margin: 10px 0 6px; font-size: ${px(10)}; }
  .signatures p { margin: 0 0 10px; }
  .sig-line { display: inline-block; min-width: 180px; border-bottom: 1px dotted #000; }
  .doc-footer-text { margin-top: 8px; text-align: center; font-size: ${px(8)}; color: #64748b; }
  ${documentPrintEdgeFooterStyles()}
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
  .extra-block { margin: 8px 0; font-size: ${px(9)}; }
  @media print {
    body { padding: 0; font-size: ${px(10, true)}; }
    .org-name { font-size: ${px(18, true)}; }
    .org-meta { font-size: ${px(9, true)}; }
    .doc-title { font-size: ${px(13, true)}; }
    .party-name { font-size: ${px(11, true)}; }
    table.doc-items { font-size: ${px(9, true)}; }
    .totals-row { font-size: ${px(10, true)}; }
    .reason-row { font-size: ${px(10, true)}; }
    .signatures { font-size: ${px(10, true)}; }
    .doc-footer-text { font-size: ${px(8, true)}; }
    .extra-block { font-size: ${px(9, true)}; }
    .watermark-text { color: rgba(15, 23, 42, 0.08); font-size: ${px(64, true)}; }
  }
`;
}

/**
 * Compact A4 document shell — org header, watermark, title, body, footer.
 */
export function buildBrandedA4DocumentHtml({
  title,
  branding = null,
  organization = null,
  generalSettings = null,
  bodyHtml = "",
  documentFooterText = "",
  printedBy = null,
  pageLabel = "Page 1 of 1",
}) {
  const resolvedBranding = branding ?? resolveDocumentBranding({ organization, generalSettings });
  const orgContact = buildOrgContactLines(organization);
  const orgHeaderHtml = resolvedBranding.showHeader
    ? buildReportOrgHeaderHtml(resolvedBranding)
    : orgContact.address || resolvedBranding.organizationName
      ? `<div class="org-name">${escapeHtml(resolvedBranding.organizationName)}</div>`
      : "";
  const watermarkHtml = buildReportWatermarkHtml(resolvedBranding);
  const printedAt = new Date().toLocaleString("en-GB");
  const footerText = documentFooterText || resolvedBranding.documentFooterText || "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)}</title>
  <style>${brandedDocumentStyles(generalSettings ?? branding?.generalSettings)}</style>
</head>
<body class="has-doc-print-edge-footer">
  ${watermarkHtml}
  <div class="page">
    <div class="page-body">
    <div class="org-brand">
      ${orgHeaderHtml}
      <div class="org-meta">
        ${orgContact.address ? `<div>${escapeHtml(orgContact.address)}</div>` : ""}
        ${orgContact.email ? `<div>Email: ${escapeHtml(orgContact.email)}</div>` : ""}
        ${orgContact.phones ? `<div>Tel: ${escapeHtml(orgContact.phones)}</div>` : ""}
        ${orgContact.pin ? `<div>PIN NO: ${escapeHtml(orgContact.pin)}</div>` : ""}
      </div>
    </div>
    <div class="doc-title">${escapeHtml(title)}</div>
    ${bodyHtml}
    ${footerText ? `<div class="doc-footer-text">${escapeHtml(footerText)}</div>` : ""}
    </div>
  </div>
  ${buildDocumentPrintEdgeFooterHtml({
    printedBy,
    printedAt,
    pageLabel,
  })}
</body>
</html>`;
}

export function printBrandedA4Document(options) {
  openPrintWindow(buildBrandedA4DocumentHtml(options), "width=860,height=960");
}

export function buildMetaFieldRows(rows) {
  return rows
    .filter((row) => row?.label)
    .map(
      (row) =>
        `<p><span class="meta-label">${escapeHtml(row.label)}</span> ${row.value != null ? escapeHtml(row.value) : "—"}</p>`,
    )
    .join("");
}

export function buildDocItemsTable({ columns, rows, emptyLabel = "No line items" }) {
  const head = columns
    .map((col) => {
      const align = col.align === "right" ? ' class="num"' : "";
      return `<th${align}>${escapeHtml(col.label)}</th>`;
    })
    .join("");

  const body = rows.length
    ? rows
        .map(
          (row) =>
            `<tr>${columns
              .map((col) => {
                const align = col.align === "right" ? ' class="num"' : "";
                const value = typeof col.getValue === "function" ? col.getValue(row) : row[col.key];
                return `<td${align}>${escapeHtml(value ?? "")}</td>`;
              })
              .join("")}</tr>`,
        )
        .join("")
    : `<tr><td colspan="${columns.length}" style="text-align:center;color:#666;">${escapeHtml(emptyLabel)}</td></tr>`;

  return `<table class="doc-items"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
