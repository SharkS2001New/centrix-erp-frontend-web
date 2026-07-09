import { fetchAllPaginatedRowsSmart } from "@/lib/paginated-fetch";

/**
 * Live stock levels — always fetched from the API (no session cache).
 * @param {string | number | null | undefined} organizationId
 * @param {string | number | null | undefined} branchId
 * @returns {Promise<Map<string, object>>}
 */
export async function fetchStockLevelsMap(_organizationId, branchId) {
  const searchParams = { per_page: 200 };
  if (branchId) searchParams.branch_id = branchId;

  const rows = await fetchAllPaginatedRowsSmart("/reports/stock-on-hand", searchParams, {
    perPage: 200,
  });

  const map = new Map();
  for (const row of rows ?? []) {
    const code = row?.product_code;
    if (code) map.set(String(code), row);
  }
  return map;
}

/** @deprecated Use fetchStockLevelsMap — stock is never cached. */
export const fetchStockLevelsMapCached = fetchStockLevelsMap;

/** Map stock-on-hand row onto product fields used across the UI. */
export function stockRowToProductFields(stock) {
  if (!stock) return {};
  const shop = Number(stock.shop_quantity ?? 0);
  const store = Number(stock.store_quantity ?? 0);
  return {
    stock_in_shop: shop,
    stock_in_store: store,
    stock_on_hand_shop: shop,
    stock_on_hand_store: store,
    stock_available_shop: shop,
    stock_available_store: store,
    branch_stock: {
      shop_quantity: shop,
      store_quantity: store,
    },
  };
}

/** Overlay live stock quantities onto a product row (catalog fields unchanged). */
export function mergeProductWithLiveStock(product, stockByCode) {
  if (!product) return product;
  const code = product.product_code;
  if (!code) return product;
  const stock = stockByCode?.get?.(String(code)) ?? stockByCode?.[String(code)];
  if (!stock) return product;
  return { ...product, ...stockRowToProductFields(stock) };
}

/** @param {Array<object>} products
 *  @param {Map<string, object> | Record<string, object>} stockByCode
 */
export function mergeProductsWithLiveStock(products, stockByCode) {
  if (!Array.isArray(products) || !stockByCode) return products ?? [];
  return products.map((product) => mergeProductWithLiveStock(product, stockByCode));
}
