/** Report export limits — keep in sync with backend config/background.php */

export const PDF_EXPORT_MAX_ROWS = 2500;

export function canExportPdf(estimatedRowCount) {
  if (estimatedRowCount == null || estimatedRowCount <= 0) return true;
  return Number(estimatedRowCount) <= PDF_EXPORT_MAX_ROWS;
}

/**
 * Strip UI pagination from export filters; keep date/branch/other active filters.
 * @param {Record<string, unknown>} searchParams
 */
export function sanitizeExportSearchParams(searchParams = {}) {
  const next = { ...searchParams };
  delete next.page;
  delete next.per_page;
  delete next.legacy_page;
  return next;
}
