import { formatOrgDate } from "@/lib/format";
import { fetchAllPaginatedRowsSmart } from "@/lib/paginated-fetch";
import { PRINT_BLOCKED_MESSAGE } from "@/lib/open-print-window";
import { printHtmlDocument } from "@/lib/print-dispatch";
import {
  buildReportOrgHeaderHtml,
  buildReportWatermarkHtml,
  reportDetailMetaLines,
  reportDocumentStyles,
} from "@/lib/reports/report-branding";
import { filterReportColumnKeys, reportColumnLabel } from "@/lib/reports/report-column-visibility";
import { reportPrintedAt, slugifyReportFilename } from "@/lib/reports/export-meta";

export { reportPrintedAt, slugifyReportFilename };

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  orientation = undefined,
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
    ...(orientation ? { orientation } : {}),
  };
}

/**
 * Landscape for wide tables (6+ cols), explicit meta, or long unbroken cell text.
 * @param {{ tableColumns: Array<{ align?: string, getValue?: Function }>, rows?: object[], orientation?: string }} options
 */
export function resolveReportPrintLandscape({ tableColumns = [], rows = [], orientation } = {}) {
  const explicit = String(orientation ?? "").toLowerCase();
  if (explicit === "landscape") return true;
  if (explicit === "portrait") return false;
  if (tableColumns.length >= 6) return true;

  for (const row of rows) {
    for (const col of tableColumns) {
      if (col.align === "right") continue;
      const value = String(typeof col.getValue === "function" ? col.getValue(row) : "");
      if (value.length >= 28 || /[^\s,]{24,}/.test(value)) return true;
    }
  }
  return false;
}

function printCellClassNames(col) {
  return [
    col.align === "right" ? "num" : "",
    col.wrap ? "wrap" : "",
    col.cellClass || (col.csvAsText ? "text" : ""),
  ]
    .filter(Boolean)
    .join(" ");
}

/** @param {Array<{ key?: string, label: string, accessor?: Function, align?: string, printAsRow?: boolean, print_as_row?: boolean, csvAsText?: boolean, cellClass?: string, wrap?: boolean }>} columns */
export function normalizeExportColumns(columns) {
  return (columns ?? []).map((col) => ({
    key: col.key ?? col.label,
    label: col.label,
    align: col.align,
    wrap: Boolean(col.wrap),
    printAsRow: Boolean(col.printAsRow || col.print_as_row),
    csvAsText: Boolean(col.csvAsText),
    cellClass: col.cellClass ?? "",
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
  const tableColumns = (columns ?? []).filter((col) => !col.printAsRow && !col.print_as_row);
  const noteColumns = (columns ?? []).filter((col) => col.printAsRow || col.print_as_row);
  const headers = tableColumns.map((col) => col.label);
  const colSpan = Math.max(1, tableColumns.length);
  const landscape = resolveReportPrintLandscape({
    tableColumns,
    rows,
    orientation: meta?.orientation,
  });
  const veryWide = tableColumns.length >= 10;
  const period =
    meta.fromDate || meta.toDate
      ? `${meta.fromDate ? formatOrgDate(meta.fromDate) : "—"} – ${meta.toDate ? formatOrgDate(meta.toDate) : "—"}`
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
  const compactTableCss = landscape
    ? veryWide
      ? "table { font-size: 8px; } th, td { padding: 2px 3px; }"
      : "table { font-size: 9px; } th, td { padding: 3px 4px; }"
    : "";

  return `<!DOCTYPE html><html class="${landscape ? "centrix-print-landscape" : ""}"><head><meta charset="utf-8"><title>${escapeHtml(meta.title)}</title>
<style>
@page { size: A4 ${landscape ? "landscape" : "portrait"}; margin: 10mm; }
${reportDocumentStyles(generalSettings)}
tr.note-row td { background: #f8fafc; color: #334155; font-size: 0.92em; padding-top: 4px; padding-bottom: 6px; }
table { table-layout: fixed; }
th, td { vertical-align: top; overflow-wrap: anywhere; word-break: break-word; white-space: normal; }
th.num, td.num { white-space: nowrap; overflow-wrap: normal; word-break: normal; }
td.text, th.text { white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; word-break: keep-all; overflow-wrap: normal; }
td.wrap, th.wrap { white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
${compactTableCss}
</style></head><body class="${landscape ? "centrix-print-landscape" : ""}">
${watermarkHtml}
${orgHeaderHtml}
<div class="meta">
  ${metaLines.map((line, index) => (index === 0 ? `<h1>${escapeHtml(line)}</h1>` : `<p>${escapeHtml(line)}</p>`)).join("")}
</div>
<table><thead><tr>${headers
    .map((header, index) => {
      const classes = printCellClassNames(tableColumns[index] ?? {});
      const classAttr = classes ? ` class="${classes}"` : "";
      return `<th${classAttr}>${escapeHtml(header)}</th>`;
    })
    .join("")}</tr></thead>
<tbody>${rows
    .map((row) => {
      const main = `<tr>${tableColumns
        .map((col) => {
          const classes = printCellClassNames(col);
          const classAttr = classes ? ` class="${classes}"` : "";
          return `<td${classAttr}>${escapeHtml(col.getValue(row))}</td>`;
        })
        .join("")}</tr>`;
      const notes = noteColumns
        .map((col) => {
          const value = String(col.getValue(row) ?? "").trim();
          if (!value) return "";
          const label = String(col.label ?? "Reason").trim() || "Reason";
          return `<tr class="note-row"><td colspan="${colSpan}"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</td></tr>`;
        })
        .join("");
      return `${main}${notes}`;
    })
    .join("")}</tbody>
${
  footerRow
    ? `<tfoot><tr>${tableColumns
        .map((col, index) => {
          const classes = printCellClassNames(col);
          const classAttr = classes ? ` class="${classes}"` : "";
          const value = footerRow[col.key] ?? (index === 0 ? "Totals" : "");
          return `<td${classAttr}>${escapeHtml(value)}</td>`;
        })
        .join("")}</tr></tfoot>`
    : ""
}
</table>
${footerText ? `<div class="doc-footer">${escapeHtml(footerText)}</div>` : ""}
</body></html>`;
}

export async function printReportTable(options) {
  const landscape = resolveReportPrintLandscape({
    tableColumns: normalizeExportColumns(options.columns ?? []).filter(
      (col) => !col.printAsRow && !col.print_as_row,
    ),
    rows: options.rows ?? [],
    orientation: options.meta?.orientation,
  });
  const result = await printHtmlDocument(buildReportPrintHtml(options), {
    jobType: "report",
    windowFeatures: landscape ? "width=1100,height=720" : "width=900,height=720",
  });
  if (!result?.ok) {
    throw new Error(result?.error || PRINT_BLOCKED_MESSAGE);
  }
  return result;
}

export function downloadReportCsv(filename, meta, columns, rows, footerRow = null) {
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

  const rowLines = [
    columns.map((col) => col.label).join(","),
    ...rows.map((row) =>
      columns
        .map((col) => {
          let text = col.getValue(row).replace(/"/g, '""');
          if (col.csvAsText && text) {
            // Leading tab keeps Excel/LibreOffice from coercing long digit strings.
            text = `\t${text}`;
          }
          return `"${text}"`;
        })
        .join(","),
    ),
  ];
  if (footerRow) {
    rowLines.push(
      columns
        .map((col, index) => {
          let raw = footerRow[col.key] ?? (index === 0 ? "Total" : "");
          let text = String(raw ?? "").replace(/"/g, '""');
          if (col.csvAsText && text) {
            text = `\t${text}`;
          }
          return `"${text}"`;
        })
        .join(","),
    );
  }

  const csvBody = rowLines.join("\n");

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
