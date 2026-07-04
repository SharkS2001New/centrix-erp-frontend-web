const STORAGE_KEY = "centrix-erp-products-list-state";

/** @typedef {{
 *   q?: string;
 *   categoryFilter?: string;
 *   subCategoryFilter?: string;
 *   stockFilter?: string;
 *   pricingFilter?: string;
 *   activeFilter?: string;
 *   stockBranchId?: string;
 *   page?: number;
 *   pageSize?: number;
 * }} ProductsListState */

/** @returns {ProductsListState | null} */
export function readProductsListState() {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/** @param {ProductsListState} state */
export function writeProductsListState(state) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}

/** Link back to the catalogue preserving the last search (and filters via session restore). */
export function productsCatalogHref() {
  const saved = readProductsListState();
  if (!saved?.q) return "/products";
  return `/products?q=${encodeURIComponent(saved.q)}`;
}
