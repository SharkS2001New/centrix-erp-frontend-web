import { apiRequest } from "@/lib/api";
import { reportPrintedAt, slugifyReportFilename } from "@/lib/reports/export";
import { sanitizeExportSearchParams } from "@/lib/report-export-limits";

/** @param {Array<{ key?: string, label: string, align?: string }>} columns */
export function serializeExportColumns(columns) {
  return (columns ?? []).map((col) => ({
    key: col.key ?? col.label,
    label: col.label,
    align: col.align ?? undefined,
  }));
}

/** @param {object} meta */
export function serializeExportMeta(meta = {}, organizationName = "") {
  return {
    organization_name: organizationName || meta.organizationName || "",
    title: meta.title ?? "",
    subtitle: meta.subtitle ?? "",
    from_date: meta.fromDate ?? "",
    to_date: meta.toDate ?? "",
    branch_name: meta.branchName ?? "",
    extra_lines: meta.extraLines ?? [],
    printed_at: meta.printedAt ?? reportPrintedAt(),
  };
}

/**
 * @param {object} options
 * @param {"xlsx"|"csv"|"pdf"|"print"} options.format
 * @param {string} options.filename
 * @param {Array} options.columns
 * @param {object} [options.meta]
 * @param {object} [options.footerRow]
 * @param {string} [options.organizationName]
 * @param {object} [options.exportSource]
 * @param {() => Promise<object[]>} [options.getRows]
 */
export function buildReportExportRequest({
  format,
  filename,
  title,
  columns,
  meta,
  footerRow,
  organizationName,
  exportSource,
  getRows,
}) {
  const exportFormat = format === "print" ? "pdf" : format;
  const body = {
    format: exportFormat,
    filename: slugifyReportFilename(filename || title || "report"),
    columns: serializeExportColumns(columns),
    meta: serializeExportMeta({ ...meta, title: title ?? meta?.title }, organizationName),
    footer_row: footerRow ?? null,
  };

  if (exportSource) {
    body.source = exportSource.source ?? "api";
    if (exportSource.path) body.path = exportSource.path;
    if (exportSource.searchParams) {
      body.search_params = sanitizeExportSearchParams(exportSource.searchParams);
    }
    if (exportSource.legacyMerge) {
      body.legacy_merge = { enabled: true };
    }
    if (exportSource.estimatedRowCount != null) {
      body.estimated_row_count = Number(exportSource.estimatedRowCount) || 0;
    }
    return body;
  }

  return {
    ...body,
    source: "inline_rows",
    rows: null,
    _getRows: getRows,
  };
}

export async function queueReportExport(body, getRows = null) {
  const payload = { ...body };
  if (payload.source === "inline_rows") {
    const rows = getRows ? await getRows() : payload.rows ?? [];
    payload.rows = rows;
    delete payload._getRows;
  }

  return apiRequest("/background-tasks/report-export", {
    method: "POST",
    body: payload,
  });
}

export async function queueReportRun(path, searchParams = {}) {
  return apiRequest("/background-tasks/report-run", {
    method: "POST",
    body: {
      path,
      search_params: sanitizeExportSearchParams(searchParams),
    },
  });
}

export async function queueReportBuilderPreview(spec, filters = {}) {
  return apiRequest("/background-tasks/report-builder-preview", {
    method: "POST",
    body: {
      spec,
      filters,
      workspace_id: filters.workspace_id,
    },
  });
}

export const PRODUCT_CATALOG_EXPORT_COLUMNS = [
  { key: "product_code", label: "Product code" },
  { key: "product_name", label: "Product name" },
  { key: "category_name", label: "Category" },
  { key: "subcategory_name", label: "Subcategory" },
  { key: "unit_price", label: "Unit price" },
  { key: "last_cost_price", label: "Cost price" },
  { key: "discount", label: "Discount" },
  { key: "shop_qty", label: "Shop stock" },
  { key: "store_qty", label: "Store stock" },
  { key: "uom_label", label: "Unit" },
  { key: "supplier_name", label: "Supplier" },
  { key: "vat_treatment", label: "VAT" },
  { key: "pricing", label: "Pricing" },
  { key: "is_active", label: "Active" },
];
