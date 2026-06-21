/** Helpers for Laravel paginated JSON responses. */

/** @param {Record<string, unknown> | null | undefined} res */
export function parsePaginator(res) {
  const items = Array.isArray(res?.data) ? res.data : [];
  return {
    items,
    page: Number(res?.current_page ?? 1),
    perPage: Number(res?.per_page ?? (items.length || 25)),
    total: Number(res?.total ?? items.length),
    totalPages: Math.max(1, Number(res?.last_page ?? 1)),
  };
}

/**
 * @param {{
 *   page?: number,
 *   perPage?: number,
 *   q?: string,
 *   filters?: Record<string, string | number | boolean | null | undefined>,
 *   extra?: Record<string, string | number | boolean | null | undefined>,
 * }} opts
 */
export function buildPageParams({ page = 1, perPage = 25, q = "", filters = {}, extra = {} }) {
  /** @type {Record<string, string | number>} */
  const searchParams = { page, per_page: perPage };

  const trimmed = String(q ?? "").trim();
  if (trimmed) searchParams.q = trimmed;

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === "" || value === "all") continue;
    searchParams[`filter[${key}]`] = value;
  }

  for (const [key, value] of Object.entries(extra)) {
    if (value === undefined || value === null || value === "") continue;
    searchParams[key] = value;
  }

  return searchParams;
}
