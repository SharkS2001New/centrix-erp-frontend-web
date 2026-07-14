import { apiRequest } from "@/lib/api";
import { fetchAllPaginatedRowsSmart } from "@/lib/paginated-fetch";
import { getStoredOrganization } from "@/lib/auth-storage";
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

/** Fields stripped when building master-data-only product rows. */
export const PRODUCT_STOCK_FIELD_KEYS = [
  "stock_in_shop",
  "stock_in_store",
  "stock_on_hand_shop",
  "stock_on_hand_store",
  "stock_available_shop",
  "stock_available_store",
  "stock_reserved_shop",
  "stock_reserved_store",
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
 * Live API product search — no client catalog cache.
 * @returns {Promise<object[]>}
 */
export async function searchProductCatalogCached(organizationId, query, options = {}) {
  const { limit = 50, status = "active" } = options;
  const trimmed = String(query ?? "").trim();
  if (!trimmed) return [];

  void resolveOrgId(organizationId);

  const searchParams = {
    q: trimmed,
    per_page: Math.min(Math.max(limit, 1), 200),
    page: 1,
  };
  if (status !== "all") searchParams.status = status;
  if (options.subcategoryId != null) {
    searchParams["filter[subcategory_id]"] = options.subcategoryId;
  }
  if (options.categoryId != null) {
    searchParams["filter[category_id]"] = options.categoryId;
  }

  const res = await apiRequest("/products", {
    searchParams,
    loading: false,
    reportIssues: false,
  });
  const rows = (Array.isArray(res?.data) ? res.data : []).map(stripProductStockFields);
  return filterProductCatalogRows(rows, {
    ...options,
    query: trimmed,
    // API already filtered by q/status; keep client filters for excludeCodes etc.
    status: "all",
  }).slice(0, limit);
}

/** Live fetch of one product by code — no catalog cache. @returns {Promise<object | null>} */
export async function fetchProductByCodeCached(organizationId, productCode, options = {}) {
  const code = String(productCode ?? "").trim();
  if (!code) return null;
  void resolveOrgId(organizationId);

  try {
    const product = await apiRequest(`/products/${encodeURIComponent(code)}`, {
      searchParams: options.status === "all" ? { status: "all" } : undefined,
      loading: false,
      reportIssues: false,
    });
    if (!product?.product_code) return null;
    return stripProductStockFields(product);
  } catch {
    const matches = await searchProductCatalogCached(organizationId, code, {
      ...options,
      limit: 10,
      status: options.status ?? "all",
    });
    return (
      matches.find((row) => String(row.product_code) === code) ??
      matches[0] ??
      null
    );
  }
}

/**
 * Fetch only the products needed for a code list (batch via product_codes).
 * @param {string[]} productCodes
 * @returns {Promise<object[]>}
 */
export async function fetchProductsByCodesCached(organizationId, productCodes, { status = "all" } = {}) {
  const unique = [
    ...new Set(
      (productCodes ?? [])
        .map((code) => String(code ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (unique.length === 0) return [];

  void resolveOrgId(organizationId);

  const chunkSize = 100;
  const rows = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const searchParams = {
      product_codes: chunk.join(","),
      per_page: Math.min(chunk.length, 200),
      page: 1,
    };
    if (status !== "all") searchParams.status = status;
    const res = await apiRequest("/products", {
      searchParams,
      loading: false,
      reportIssues: false,
    });
    const pageRows = Array.isArray(res?.data) ? res.data : [];
    for (const row of pageRows) {
      rows.push(stripProductStockFields(row));
    }
  }
  return rows;
}

export async function isProductCodeInCatalogCached(organizationId, productCode, options = {}) {
  const product = await fetchProductByCodeCached(organizationId, productCode, {
    status: "all",
    ...options,
  });
  return Boolean(product);
}

/**
 * Full product list via live paginated API (no org cache).
 * Prefer searchProductCatalogCached for pickers.
 * @returns {Promise<object[]>}
 */
export async function fetchProductCatalogCached(organizationId, { status = "active" } = {}) {
  void resolveOrgId(organizationId);
  const searchParams = { per_page: 200 };
  if (status !== "all") searchParams.status = status;
  const rows = await fetchAllPaginatedRowsSmart(
    "/products",
    searchParams,
    { perPage: 200 },
  );
  return (rows ?? []).map(stripProductStockFields);
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
 */
export async function fetchProductsWithLiveStock(organizationId, branchId, options = {}) {
  const [catalog, stockByCode] = await Promise.all([
    fetchProductCatalogCached(organizationId, options),
    fetchStockLevelsMap(organizationId, branchId),
  ]);
  return mergeProductsWithLiveStock(catalog, stockByCode);
}

/** No-op — product catalog is no longer cached client-side. */
export function invalidateProductCatalogCache(_organizationId) {
  // Product search/list always hits the API.
}
