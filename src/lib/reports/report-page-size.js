/**
 * Shared list page-size policy for ERP reports.
 * Global localStorage can prefer 100 rows — heavy reports must not inherit that.
 */
export const REPORT_DEFAULT_PAGE_SIZE = 20;
export const REPORT_MAX_PAGE_SIZE = 50;

export const REPORT_LIST_PAGE_SIZE_OPTIONS = {
  maxSize: REPORT_MAX_PAGE_SIZE,
};

/**
 * Only reuse tab-pane cache rows when they match the active page size.
 * Prevents "paint 50 rows then snap to 20" on remount.
 *
 * @param {{ pageSize?: number, rows?: unknown[] } | null | undefined} bundle
 * @param {number} pageSize
 */
export function reportCacheMatchesPageSize(bundle, pageSize) {
  if (!bundle || !(pageSize > 0)) return false;
  if (bundle.pageSize != null) {
    return Number(bundle.pageSize) === Number(pageSize);
  }
  // Legacy caches without pageSize: reject oversized row sets.
  if (Array.isArray(bundle.rows) && bundle.rows.length > pageSize) {
    return false;
  }
  return true;
}
