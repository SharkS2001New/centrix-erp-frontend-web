/**
 * Till-local recent POS picks — shown above search when the scan field is empty/idle.
 */

const STORAGE_PREFIX = "centrix-erp-pos-recent-products";
const MAX_RECENT = 10;

function storageKey(orgId, branchId) {
  return `${STORAGE_PREFIX}:${orgId ?? "org"}:${branchId ?? "branch"}`;
}

/**
 * @param {{ organizationId?: string|number|null, branchId?: string|number|null }} [scope]
 * @returns {Array<{ product_code: string, product_name: string, at: number }>}
 */
export function readPosRecentProducts(scope = {}) {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(storageKey(scope.organizationId, scope.branchId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => row && row.product_code)
      .slice(0, MAX_RECENT)
      .map((row) => ({
        product_code: String(row.product_code),
        product_name: String(row.product_name ?? row.product_code),
        at: Number(row.at) || 0,
      }));
  } catch {
    return [];
  }
}

/**
 * @param {object} product
 * @param {{ organizationId?: string|number|null, branchId?: string|number|null }} [scope]
 */
export function rememberPosRecentProduct(product, scope = {}) {
  if (typeof window === "undefined" || !product?.product_code) return;
  const code = String(product.product_code);
  const next = [
    {
      product_code: code,
      product_name: String(product.product_name ?? code),
      at: Date.now(),
    },
    ...readPosRecentProducts(scope).filter((row) => row.product_code !== code),
  ].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(storageKey(scope.organizationId, scope.branchId), JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}
