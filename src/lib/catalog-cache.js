import { fetchAllPaginatedRowsSmart } from "@/lib/paginated-fetch";
import { getStoredOrganization } from "@/lib/auth-storage";
import {
  fetchOrgCached,
  invalidateOrgCacheResource,
  orgCacheKey,
} from "@/lib/org-cache";
import {
  fetchStockLevelsMap,
  mergeProductWithLiveStock,
  mergeProductsWithLiveStock,
} from "@/lib/stock-cache";

export {
  fetchStockLevelsMap,
  fetchStockLevelsMapCached,
  mergeProductWithLiveStock,
  mergeProductsWithLiveStock,
} from "@/lib/stock-cache";

/** Fields stripped from cached catalog — stock is always fetched live. */
export const PRODUCT_STOCK_FIELD_KEYS = [
  "stock_in_shop",
  "stock_in_store",
  "stock_on_hand_shop",
  "stock_on_hand_store",
  "stock_available_shop",
  "stock_available_store",
  "shop_quantity",
  "store_quantity",
  "branch_stock",
];

export function stripProductStockFields(product) {
  if (!product || typeof product !== "object") return product;
  const next = { ...product };
  for (const key of PRODUCT_STOCK_FIELD_KEYS) {
    delete next[key];
  }
  return next;
}

function resolveOrgId(organizationId) {
  return organizationId ?? getStoredOrganization()?.id ?? null;
}

function catalogSearchScore(product, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return 0;
  const name = String(product?.product_name ?? "").toLowerCase();
  const code = String(product?.product_code ?? "").toLowerCase();
  const sku = String(product?.sku ?? product?.barcode ?? "").toLowerCase();
  if (code === q) return 100;
  if (code.startsWith(q)) return 80;
  if (name === q) return 70;
  if (name.startsWith(q)) return 60;
  if (code.includes(q)) return 50;
  if (name.includes(q)) return 40;
  if (sku.includes(q)) return 30;
  return 0;
}

export function productMatchesCatalogQuery(product, query) {
  return catalogSearchScore(product, query) > 0;
}

function sortCatalogSearchResults(products, query) {
  const q = String(query ?? "").trim();
  if (!q) return products;
  return [...products].sort((a, b) => catalogSearchScore(b, q) - catalogSearchScore(a, q));
}

function filterProductCatalogRows(rows, options = {}) {
  const {
    query,
    status = "active",
    subcategoryId,
    categoryId,
    subcategoryIds,
    excludeCodes,
    productCode,
  } = options;

  let list = rows ?? [];

  if (status === "active") {
    list = list.filter((product) => product.is_active !== false);
  } else if (status === "inactive") {
    list = list.filter((product) => product.is_active === false);
  }

  if (productCode != null) {
    const code = String(productCode);
    list = list.filter((product) => String(product.product_code) === code);
  }

  if (subcategoryId != null) {
    list = list.filter((product) => String(product.subcategory_id) === String(subcategoryId));
  }

  if (categoryId != null && subcategoryIds?.length) {
    const allowed = new Set(subcategoryIds.map(String));
    list = list.filter((product) => allowed.has(String(product.subcategory_id)));
  }

  if (query?.trim()) {
    list = list.filter((product) => productMatchesCatalogQuery(product, query));
  }

  if (excludeCodes?.size) {
    list = list.filter((product) => !excludeCodes.has(String(product.product_code)));
  }

  return sortCatalogSearchResults(list, query);
}

/**
 * Search cached product catalog (master data only — no stock).
 * @returns {Promise<object[]>}
 */
export async function searchProductCatalogCached(organizationId, query, options = {}) {
  const { limit = 50, status = "active" } = options;
  const rows = await fetchProductCatalogCached(resolveOrgId(organizationId), { status });
  return filterProductCatalogRows(rows, { ...options, query }).slice(0, limit);
}

/** @returns {Promise<object | null>} */
export async function fetchProductByCodeCached(organizationId, productCode, options = {}) {
  const code = String(productCode ?? "").trim();
  if (!code) return null;
  const rows = await fetchProductCatalogCached(resolveOrgId(organizationId), {
    status: options.status ?? "all",
  });
  return filterProductCatalogRows(rows, { ...options, productCode: code, status: options.status ?? "all" })[0] ?? null;
}

export async function isProductCodeInCatalogCached(organizationId, productCode, options = {}) {
  const product = await fetchProductByCodeCached(organizationId, productCode, {
    status: "all",
    ...options,
  });
  return Boolean(product);
}

/**
 * Master product list (no live stock). Org-scoped, invalidated on product CUD.
 * @returns {Promise<object[]>}
 */
export async function fetchProductCatalogCached(organizationId, { status = "active" } = {}) {
  const orgId = resolveOrgId(organizationId);
  const key = orgCacheKey(orgId, "product-catalog", status);

  return fetchOrgCached(key, async () => {
    const searchParams = { per_page: 200 };
    if (status !== "all") searchParams.status = status;
    const rows = await fetchAllPaginatedRowsSmart(
      "/products",
      searchParams,
      { perPage: 200 },
    );
    return (rows ?? []).map(stripProductStockFields);
  });
}

/** @returns {Promise<Map<string, object>>} */
export async function fetchProductCatalogMapCached(organizationId, options = {}) {
  const rows = await fetchProductCatalogCached(organizationId, options);
  const map = new Map();
  for (const row of rows) {
    if (row?.product_code) map.set(String(row.product_code), row);
  }
  return map;
}

/**
 * Catalog row + live stock for one branch.
 * @param {string | number | null | undefined} organizationId
 * @param {string | number | null | undefined} branchId
 */
export async function fetchProductsWithLiveStock(organizationId, branchId, options = {}) {
  const [catalog, stockByCode] = await Promise.all([
    fetchProductCatalogCached(organizationId, options),
    fetchStockLevelsMap(organizationId, branchId),
  ]);
  return mergeProductsWithLiveStock(catalog, stockByCode);
}

export function invalidateProductCatalogCache(organizationId) {
  invalidateOrgCacheResource(organizationId, "product-catalog");
}
