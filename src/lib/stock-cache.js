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

function numOrNull(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Resolve sellable qty: prefer report available, else product API available/reserved
 * against live on-hand. Never silently treat on-hand as available.
 */
function resolveAvailableQty({
  onHand,
  reportAvailable,
  reportReserved,
  productAvailable,
  productReserved,
  productOnHand,
}) {
  if (reportAvailable != null) {
    return Math.max(0, reportAvailable);
  }
  const reserved =
    reportReserved ??
    productReserved ??
    (productOnHand != null && productAvailable != null
      ? Math.max(0, productOnHand - productAvailable)
      : null);
  if (reserved != null) {
    return Math.max(0, onHand - reserved);
  }
  if (productAvailable != null) {
    return Math.max(0, productAvailable);
  }
  return Math.max(0, onHand);
}

/** Map stock-on-hand row onto product fields used across the UI. */
export function stockRowToProductFields(stock, product = null) {
  if (!stock) return {};
  const shop = Number(stock.shop_quantity ?? 0);
  const store = Number(stock.store_quantity ?? 0);

  const availableShop = resolveAvailableQty({
    onHand: shop,
    reportAvailable: numOrNull(stock.available_shop_quantity ?? stock.shop_available),
    reportReserved: numOrNull(stock.reserved_shop_quantity),
    productAvailable: numOrNull(product?.stock_available_shop),
    productReserved: numOrNull(product?.stock_reserved_shop),
    productOnHand: numOrNull(
      product?.stock_on_hand_shop ?? product?.stock_in_shop,
    ),
  });
  const availableStore = resolveAvailableQty({
    onHand: store,
    reportAvailable: numOrNull(stock.available_store_quantity ?? stock.store_available),
    reportReserved: numOrNull(stock.reserved_store_quantity),
    productAvailable: numOrNull(product?.stock_available_store),
    productReserved: numOrNull(product?.stock_reserved_store),
    productOnHand: numOrNull(
      product?.stock_on_hand_store ?? product?.stock_in_store,
    ),
  });
  const reservedShop = Math.max(0, shop - availableShop);
  const reservedStore = Math.max(0, store - availableStore);

  return {
    stock_in_shop: shop,
    stock_in_store: store,
    stock_on_hand_shop: shop,
    stock_on_hand_store: store,
    stock_reserved_shop: reservedShop,
    stock_reserved_store: reservedStore,
    stock_available_shop: availableShop,
    stock_available_store: availableStore,
    branch_stock: {
      shop_quantity: shop,
      store_quantity: store,
      shop_reserved: reservedShop,
      store_reserved: reservedStore,
      shop_available: availableShop,
      store_available: availableStore,
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
  return { ...product, ...stockRowToProductFields(stock, product) };
}

/** @param {Array<object>} products
 *  @param {Map<string, object> | Record<string, object>} stockByCode
 */
export function mergeProductsWithLiveStock(products, stockByCode) {
  if (!Array.isArray(products) || !stockByCode) return products ?? [];
  return products.map((product) => mergeProductWithLiveStock(product, stockByCode));
}
