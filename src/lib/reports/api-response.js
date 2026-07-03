/** Normalize paginated or legacy array report API payloads. */
export function normalizeReportRows(response) {
  if (Array.isArray(response)) {
    return response;
  }
  if (Array.isArray(response?.data)) {
    return response.data;
  }
  if (Array.isArray(response?.rows)) {
    return response.rows;
  }
  if (Array.isArray(response?.report?.data)) {
    return response.report.data;
  }
  return [];
}

/** @param {unknown} response */
export function normalizeReportMeta(response, fallbackPage = 1, fallbackPageSize = 20) {
  if (Array.isArray(response)) {
    return {
      current_page: 1,
      last_page: 1,
      total: response.length,
      per_page: response.length || fallbackPageSize,
    };
  }

  const rows = response?.data ?? [];
  return {
    current_page: response?.current_page ?? fallbackPage,
    last_page: response?.last_page ?? 1,
    total: response?.total ?? rows.length,
    per_page: response?.per_page ?? fallbackPageSize,
  };
}
