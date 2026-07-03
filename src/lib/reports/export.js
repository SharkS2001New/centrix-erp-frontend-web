import { formatShortDate } from "@/components/catalog/catalog-shared";
import { formatAppDateTime } from "@/lib/datetime";
import { fetchAllPaginatedRowsSmart } from "@/lib/paginated-fetch";
import { openPrintWindow, PRINT_BLOCKED_MESSAGE } from "@/lib/open-print-window";
import {
  buildReportOrgHeaderHtml,
  buildReportWatermarkHtml,
  reportDetailMetaLines,
  reportDocumentStyles,
} from "@/lib/reports/report-branding";
import { filterReportColumnKeys, reportColumnLabel } from "@/lib/reports/report-column-visibility";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function reportPrintedAt() {
  return formatAppDateTime(new Date());
}

/** @param {object} options */
export function buildReportMeta({
  organizationName = "",
  title = "Report",
  subtitle = "",
  fromDate = "",
  toDate = "",
  branchName = "",
  extraLines = [],
  printedAt = reportPrintedAt(),
} = {}) {
  return {
    organizationName,
    title,
    subtitle,
    fromDate,
    toDate,
    branchName,
    extraLines,
    printedAt,
  };
}

/** @param {Array<{ key?: string, label: string, accessor?: Function, align?: string }>} columns */
export function normalizeExportColumns(columns) {
  return (columns ?? []).map((col) => ({
    key: col.key ?? col.label,
    label: col.label,
    align: col.align,
    getValue: (row) => {
      const raw = typeof col.accessor === "function" ? col.accessor(row) : row[col.key];
      if (raw == null) return "";
      return String(raw);
    },
  }));
}

/** @param {object} meta @param {ReturnType<normalizeExportColumns>} columns @param {object[]} rows @param {object} [options] */
export function buildReportPrintHtml({
  meta,
  columns,
  rows,
  footerRow = null,
  branding = null,
  generalSettings = null,
}) {
  const headers = columns.map((col) => col.label);
  const period =
    meta.fromDate || meta.toDate
      ? `${meta.fromDate ? formatShortDate(meta.fromDate) : "—"} – ${meta.toDate ? formatShortDate(meta.toDate) : "—"}`
      : "";

  const detailMeta = {
    ...meta,
    periodLine: period ? `Period: ${period}` : "",
    branchLine: meta.branchName ? `Branch: ${meta.branchName}` : "",
    printedLine: `Printed: ${meta.printedAt}`,
  };
  const metaLines = reportDetailMetaLines(detailMeta, branding);
  const orgHeaderHtml = branding ? buildReportOrgHeaderHtml(branding) : "";
  const watermarkHtml = branding ? buildReportWatermarkHtml(branding) : "";
  const footerText = branding?.documentFooterText?.trim?.() || "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(meta.title)}</title>
<style>
${reportDocumentStyles(generalSettings)}
</style></head><body>
${watermarkHtml}
${orgHeaderHtml}
<div class="meta">
  ${metaLines.map((line, index) => (index === 0 ? `<h1>${escapeHtml(line)}</h1>` : `<p>${escapeHtml(line)}</p>`)).join("")}
</div>
<table><thead><tr>${headers
    .map((header, index) => {
      const align = columns[index]?.align === "right" ? " class=\"num\"" : "";
      return `<th${align}>${escapeHtml(header)}</th>`;
    })
    .join("")}</tr></thead>
<tbody>${rows
    .map(
      (row) =>
        `<tr>${columns
          .map((col) => {
            const align = col.align === "right" ? " class=\"num\"" : "";
            return `<td${align}>${escapeHtml(col.getValue(row))}</td>`;
          })
          .join("")}</tr>`,
    )
    .join("")}</tbody>
${
  footerRow
    ? `<tfoot><tr>${columns
        .map((col, index) => {
          const align = col.align === "right" ? " class=\"num\"" : "";
          const value = footerRow[col.key] ?? (index === 0 ? "Totals" : "");
          return `<td${align}>${escapeHtml(value)}</td>`;
        })
        .join("")}</tr></tfoot>`
    : ""
}
</table>
${footerText ? `<div class="doc-footer">${escapeHtml(footerText)}</div>` : ""}
</body></html>`;
}

export function printReportTable(options) {
  const win = openPrintWindow(buildReportPrintHtml(options), "width=900,height=720");
  if (!win) {
    throw new Error(PRINT_BLOCKED_MESSAGE);
  }
}

export function downloadReportCsv(filename, meta, columns, rows) {
  const headerLines = [];
  if (meta.organizationName) headerLines.push(`"${meta.organizationName.replace(/"/g, '""')}"`);
  headerLines.push(`"${meta.title.replace(/"/g, '""')}"`);
  if (meta.subtitle) headerLines.push(`"${meta.subtitle.replace(/"/g, '""')}"`);
  if (meta.fromDate || meta.toDate) {
    headerLines.push(
      `"Period: ${meta.fromDate || "—"} – ${meta.toDate || "—"}"`,
    );
  }
  if (meta.branchName) headerLines.push(`"Branch: ${meta.branchName.replace(/"/g, '""')}"`);
  for (const line of meta.extraLines ?? []) {
    headerLines.push(`"${String(line).replace(/"/g, '""')}"`);
  }
  headerLines.push(`"Printed: ${meta.printedAt}"`);
  headerLines.push("");

  const csvBody = [
    columns.map((col) => col.label).join(","),
    ...rows.map((row) =>
      columns
        .map((col) => {
          const text = col.getValue(row).replace(/"/g, '""');
          return `"${text}"`;
        })
        .join(","),
    ),
  ].join("\n");

  const blob = new Blob([`${headerLines.join("\n")}\n${csvBody}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/** Fetch all pages from a paginated report API (max 200 per page). */
export async function fetchAllPaginatedRows(apiPath, baseSearchParams = {}, options = {}) {
  return fetchAllPaginatedRowsSmart(apiPath, baseSearchParams, options);
}

export function slugifyReportFilename(value) {
  return String(value ?? "report")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** @param {object[]} rows @param {(key: string) => string} [labelize] @param {{ multiBranch?: boolean }} [options] */
export function columnsFromRowKeys(rows, labelize = reportColumnLabel, options = {}) {
  if (!rows[0]) return [];
  return filterReportColumnKeys(Object.keys(rows[0]), options)
    .filter((key) => !["is_header", "is_total"].includes(key))
    .map((key) => ({
      key,
      label: labelize(key),
      accessor: (row) => row[key],
    }));
}
