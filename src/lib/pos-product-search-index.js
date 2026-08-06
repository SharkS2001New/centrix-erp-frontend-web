/**
 * In-memory POS product search index.
 * Precomputes normalized / compact / token fields once per catalog warm.
 */

import {
  normalizeSearchText,
  rankPosProductSearchResults,
} from "@/lib/pos-product-search-rank";

/** @type {Map<string, object>|null} code → product */
let catalogByCode = null;
/** @type {object[]|null} indexed entries { product, ...search fields } */
let indexedEntries = null;
/** @type {number} */
let catalogVersion = 0;

/**
 * @param {object} product
 */
export function buildProductSearchEntry(product) {
  const code = String(product?.product_code ?? "");
  const name = String(product?.product_name ?? "");
  const sku = String(product?.sku ?? "");
  const barcode = String(product?.barcode ?? product?.alternate_barcode ?? "");
  const shortCode = String(product?.short_code ?? "");
  const shelf = String(product?.shelf_location ?? "");

  const nameNorm = normalizeSearchText(name);
  const codeNorm = normalizeSearchText(code);
  const skuNorm = normalizeSearchText(sku);
  const barcodeNorm = normalizeSearchText(barcode);
  const shortNorm = normalizeSearchText(shortCode);
  const shelfNorm = normalizeSearchText(shelf);

  const prices = [];
  for (const key of ["unit_price", "last_selling_price", "selling_price", "price"]) {
    const n = Number(product?.[key]);
    if (!Number.isFinite(n) || n <= 0) continue;
    const rounded = Math.round(n * 100) / 100;
    if (!prices.includes(rounded)) prices.push(rounded);
  }

  return {
    product,
    code: codeNorm.normalized,
    codeCompact: codeNorm.compact,
    name: nameNorm.normalized,
    nameCompact: nameNorm.compact,
    words: nameNorm.tokens,
    sku: skuNorm.normalized,
    skuCompact: skuNorm.compact,
    barcode: barcodeNorm.normalized,
    barcodeCompact: barcodeNorm.compact,
    shortCode: shortNorm.normalized,
    shortCompact: shortNorm.compact,
    shelf: shelfNorm.normalized,
    prices,
  };
}

/**
 * Replace the in-memory catalog index (call after warm / full catalog fetch).
 * @param {object[]} products
 */
export function setPosSearchCatalog(products) {
  const list = Array.isArray(products) ? products : [];
  const byCode = new Map();
  const entries = [];
  for (const product of list) {
    const code = String(product?.product_code ?? "");
    if (!code) continue;
    byCode.set(code, product);
    entries.push(buildProductSearchEntry(product));
  }
  catalogByCode = byCode;
  indexedEntries = entries;
  catalogVersion += 1;
  return { count: entries.length, version: catalogVersion };
}

/** @returns {number} */
export function getPosSearchCatalogVersion() {
  return catalogVersion;
}

/** @returns {number} */
export function getPosSearchCatalogSize() {
  return indexedEntries?.length ?? 0;
}

/** @returns {boolean} */
export function hasPosSearchCatalog() {
  return Array.isArray(indexedEntries) && indexedEntries.length > 0;
}

/**
 * Upsert a few products into the live index (cart enrich / API hit).
 * @param {object[]} products
 */
export function upsertPosSearchProducts(products) {
  if (!Array.isArray(products) || !products.length) return;
  if (!catalogByCode || !indexedEntries) {
    setPosSearchCatalog(products);
    return;
  }
  for (const product of products) {
    const code = String(product?.product_code ?? "");
    if (!code) continue;
    const prev = catalogByCode.get(code);
    const next = prev ? { ...prev, ...product } : product;
    catalogByCode.set(code, next);
    const entry = buildProductSearchEntry(next);
    const idx = indexedEntries.findIndex((row) => row.code === entry.code);
    if (idx >= 0) indexedEntries[idx] = entry;
    else indexedEntries.push(entry);
  }
  catalogVersion += 1;
}

/**
 * Fast in-memory search. Returns products (not entries).
 * @param {string} query
 * @param {{
 *   limit?: number,
 *   getAvailableQty?: (product: object) => number | null | undefined,
 * }} [options]
 */
export function searchPosCatalogIndex(query, options = {}) {
  if (!indexedEntries?.length) return [];
  const limit = options.limit ?? 40;
  const getQty = options.getAvailableQty;
  const indexedByCode = Object.fromEntries(
    indexedEntries.map((entry) => [String(entry.product.product_code), entry]),
  );
  const products = indexedEntries.map((entry) => entry.product);
  return rankPosProductSearchResults(products, query, {
    limit,
    getAvailableQty: getQty,
    indexedByCode,
  });
}

/**
 * True when two result lists show the same products in the same order (skip React redraw).
 * @param {object[]} prev
 * @param {object[]} next
 */
export function sameSearchResultList(prev, next) {
  const a = prev ?? [];
  const b = next ?? [];
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i]?.product_code ?? "") !== String(b[i]?.product_code ?? "")) return false;
  }
  return true;
}
