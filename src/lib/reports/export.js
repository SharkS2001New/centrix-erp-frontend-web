import { formatShortDate } from "@/components/catalog/catalog-shared";
import { fetchAllPaginatedRowsSmart } from "@/lib/paginated-fetch";
import { openPrintWindow } from "@/lib/open-print-window";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function reportPrintedAt() {
  return new Date().toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
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

/** @param {object} meta @param {ReturnType<normalizeExportColumns>} columns @param {object[]} rows */
export function buildReportPrintHtml({ meta, columns, rows, footerRow = null }) {
  const headers = columns.map((col) => col.label);
  const period =
    meta.fromDate || meta.toDate
      ? `${meta.fromDate ? formatShortDate(meta.fromDate) : "—"} – ${meta.toDate ? formatShortDate(meta.toDate) : "—"}`
      : "";

  const metaLines = [
    meta.organizationName,
    meta.title,
    meta.subtitle,
    period ? `Period: ${period}` : "",
    meta.branchName ? `Branch: ${meta.branchName}` : "",
    ...(meta.extraLines ?? []),
    `Printed: ${meta.printedAt}`,
  ].filter(Boolean);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(meta.title)}</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 24px; color: #111; }
  .meta { margin-bottom: 20px; }
  .meta h1 { font-size: 18px; margin: 0 0 4px; }
  .meta p { margin: 2px 0; font-size: 12px; color: #475569; }
  table { width: 100%; border-collapse: collapse; font-size: 11px; }
  th, td { border: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  th { background: #f8fafc; }
  td.num, th.num { text-align: right; }
  tfoot td { font-weight: 600; background: #f8fafc; }
</style></head><body>
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
</table></body></html>`;
}

export function printReportTable(options) {
  openPrintWindow(buildReportPrintHtml(options), "width=900,height=720");
}

export async function downloadReportExcel(filename, sheetName, meta, columns, rows) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName.slice(0, 31) || "Report");

  const push = (value) => sheet.addRow([value]);

  if (meta.organizationName) push(meta.organizationName);
  push(meta.title);
  if (meta.subtitle) push(meta.subtitle);
  if (meta.fromDate || meta.toDate) {
    push(
      `Period: ${meta.fromDate ? formatShortDate(meta.fromDate) : "—"} – ${meta.toDate ? formatShortDate(meta.toDate) : "—"}`,
    );
  }
  if (meta.branchName) push(`Branch: ${meta.branchName}`);
  for (const line of meta.extraLines ?? []) push(line);
  push(`Printed: ${meta.printedAt}`);
  sheet.addRow([]);

  const headers = columns.map((col) => col.label);
  sheet.addRow(headers);
  for (const row of rows) {
    sheet.addRow(columns.map((col) => col.getValue(row)));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
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

/** @param {object[]} rows @param {(key: string) => string} labelize */
export function columnsFromRowKeys(rows, labelize = (key) => key) {
  if (!rows[0]) return [];
  return Object.keys(rows[0])
    .filter((key) => !key.startsWith("_") && !["is_header", "is_total"].includes(key))
    .map((key) => ({
      key,
      label: labelize(key),
      accessor: (row) => row[key],
    }));
}
