/**
 * In-memory POS product search index.
 * Precomputes normalized fields + 2-char prefix postings for candidate pruning.
 * Snapshots hydrate from IndexedDB so reloads skip full re-normalize.
 */

import {
  normalizeSearchText,
  parseAmountSearchTerm,
  rankPosProductSearchResults,
} from "@/lib/pos-product-search-rank";

/** Bump when entry/posting shape changes (invalidates persisted snapshots). */
export const POS_SEARCH_INDEX_SCHEMA = 1;

/** Use a worker when the candidate set is this large (keeps UI thread free). */
export const POS_SEARCH_WORKER_MIN_CANDIDATES = 8000;

/** @type {Map<string, object>|null} code → product */
let catalogByCode = null;
/** @type {Map<string, object>|null} code → index entry */
let entryByCode = null;
/** @type {object[]|null} indexed entries */
let indexedEntries = null;
/** @type {Map<string, number[]>|null} 2-char prefix → entry indexes */
let prefixIndex = null;
/** @type {Map<string, number[]>|null} compact barcode/code/sku → entry indexes */
let exactCodeIndex = null;
/** @type {number} */
let catalogVersion = 0;
/** @type {number|null} catalog_warmed_at tied to last hydrate/build */
let indexWarmedAt = null;

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
    product_code: code,
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
 * Strip nested product for IDB (re-attach from catalog on hydrate).
 * @param {object} entry
 */
function serializeEntry(entry) {
  const { product: _product, ...rest } = entry;
  return rest;
}

/**
 * @param {Map<string, number[]>} map
 * @param {string} text
 * @param {number} idx
 */
function addPrefixKeys(map, text, idx) {
  const value = String(text ?? "");
  if (value.length < 2) return;
  const key = value.slice(0, 2);
  const bucket = map.get(key);
  if (bucket) bucket.push(idx);
  else map.set(key, [idx]);
}

/**
 * @param {Map<string, number[]>} map
 * @param {string} compact
 * @param {number} idx
 */
function addExactKey(map, compact, idx) {
  if (!compact) return;
  const bucket = map.get(compact);
  if (bucket) bucket.push(idx);
  else map.set(compact, [idx]);
}

/**
 * @param {object[]} entries
 */
function rebuildIndexes(entries) {
  const prefix = new Map();
  const exact = new Map();
  for (let i = 0; i < entries.length; i += 1) {
    const e = entries[i];
    addPrefixKeys(prefix, e.codeCompact, i);
    addPrefixKeys(prefix, e.nameCompact, i);
    addPrefixKeys(prefix, e.skuCompact, i);
    addPrefixKeys(prefix, e.barcodeCompact, i);
    addPrefixKeys(prefix, e.shortCompact, i);
    for (const word of e.words ?? []) addPrefixKeys(prefix, word, i);

    addExactKey(exact, e.codeCompact, i);
    addExactKey(exact, e.skuCompact, i);
    addExactKey(exact, e.barcodeCompact, i);
    addExactKey(exact, e.shortCompact, i);
  }
  prefixIndex = prefix;
  exactCodeIndex = exact;
}

/**
 * @param {Map<string, number[]>} map
 * @returns {[string, number[]][]}
 */
function mapToPairs(map) {
  if (!map) return [];
  return [...map.entries()];
}

/**
 * Snapshot for IndexedDB meta (no nested product blobs).
 * @param {{ warmedAt?: number|null }} [meta]
 */
export function serializePosSearchIndex(meta = {}) {
  if (!indexedEntries?.length) return null;
  return {
    schema: POS_SEARCH_INDEX_SCHEMA,
    warmedAt: meta.warmedAt ?? indexWarmedAt ?? null,
    catalogCount: indexedEntries.length,
    entries: indexedEntries.map(serializeEntry),
    prefix: mapToPairs(prefixIndex),
    exact: mapToPairs(exactCodeIndex),
  };
}

/**
 * @param {object|null|undefined} snapshot
 * @param {{ warmedAt?: number|null, catalogCount?: number }} [expected]
 */
export function isPosSearchIndexSnapshotValid(snapshot, expected = {}) {
  if (!snapshot || snapshot.schema !== POS_SEARCH_INDEX_SCHEMA) return false;
  if (!Array.isArray(snapshot.entries) || !snapshot.entries.length) return false;
  if (
    expected.catalogCount != null &&
    Number(snapshot.catalogCount) !== Number(expected.catalogCount)
  ) {
    return false;
  }
  if (
    expected.warmedAt != null &&
    Number(snapshot.warmedAt) !== Number(expected.warmedAt)
  ) {
    return false;
  }
  return true;
}

/**
 * Hydrate memory maps from a persisted snapshot + live catalog products.
 * @param {object} snapshot
 * @param {object[]} products
 * @returns {boolean}
 */
export function hydratePosSearchIndex(snapshot, products) {
  if (!isPosSearchIndexSnapshotValid(snapshot)) return false;
  const byCode = new Map();
  for (const product of products ?? []) {
    const code = String(product?.product_code ?? "");
    if (code) byCode.set(code, product);
  }

  const entries = [];
  const byEntry = new Map();
  for (const raw of snapshot.entries) {
    const code = String(raw?.product_code ?? "");
    const product = byCode.get(code);
    if (!product) continue;
    const entry = { ...raw, product, product_code: code };
    entries.push(entry);
    byEntry.set(code, entry);
  }
  if (!entries.length) return false;

  catalogByCode = byCode;
  entryByCode = byEntry;
  indexedEntries = entries;
  // Always rebuild postings — entry list may omit products missing from IDB catalog.
  rebuildIndexes(entries);
  indexWarmedAt = snapshot.warmedAt != null ? Number(snapshot.warmedAt) : null;
  catalogVersion += 1;
  return true;
}

/**
 * Replace the in-memory catalog index (call after warm / full catalog fetch).
 * @param {object[]} products
 * @param {{ warmedAt?: number|null }} [meta]
 */
export function setPosSearchCatalog(products, meta = {}) {
  const list = Array.isArray(products) ? products : [];
  const byCode = new Map();
  const byEntry = new Map();
  const entries = [];
  for (const product of list) {
    const code = String(product?.product_code ?? "");
    if (!code) continue;
    byCode.set(code, product);
    const entry = buildProductSearchEntry(product);
    byEntry.set(code, entry);
    entries.push(entry);
  }
  catalogByCode = byCode;
  entryByCode = byEntry;
  indexedEntries = entries;
  rebuildIndexes(entries);
  indexWarmedAt = meta.warmedAt != null ? Number(meta.warmedAt) : indexWarmedAt;
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
 * New codes get incremental prefix postings — avoids full catalog rebuild on every search.
 * @param {object[]} products
 */
export function upsertPosSearchProducts(products) {
  if (!Array.isArray(products) || !products.length) return;
  if (!catalogByCode || !indexedEntries || !entryByCode || !prefixIndex || !exactCodeIndex) {
    setPosSearchCatalog(products);
    return;
  }
  let touched = false;
  for (const product of products) {
    const code = String(product?.product_code ?? "");
    if (!code) continue;
    const prev = catalogByCode.get(code);
    const next = prev ? { ...prev, ...product } : product;
    catalogByCode.set(code, next);
    const entry = buildProductSearchEntry(next);
    const existing = entryByCode.get(code);
    if (existing) {
      const idx = indexedEntries.indexOf(existing);
      if (idx >= 0) {
        // Replace in place — existing prefix buckets still point at this index.
        indexedEntries[idx] = entry;
      } else {
        const newIdx = indexedEntries.length;
        indexedEntries.push(entry);
        indexEntryPostings(entry, newIdx);
      }
      entryByCode.set(code, entry);
      touched = true;
    } else {
      const newIdx = indexedEntries.length;
      indexedEntries.push(entry);
      entryByCode.set(code, entry);
      indexEntryPostings(entry, newIdx);
      touched = true;
    }
  }
  if (touched) catalogVersion += 1;
}

/** @param {object} entry @param {number} idx */
function indexEntryPostings(entry, idx) {
  addPrefixKeys(prefixIndex, entry.codeCompact, idx);
  addPrefixKeys(prefixIndex, entry.nameCompact, idx);
  addPrefixKeys(prefixIndex, entry.skuCompact, idx);
  addPrefixKeys(prefixIndex, entry.barcodeCompact, idx);
  addPrefixKeys(prefixIndex, entry.shortCompact, idx);
  for (const word of entry.words ?? []) addPrefixKeys(prefixIndex, word, idx);
  addExactKey(exactCodeIndex, entry.codeCompact, idx);
  addExactKey(exactCodeIndex, entry.skuCompact, idx);
  addExactKey(exactCodeIndex, entry.barcodeCompact, idx);
  addExactKey(exactCodeIndex, entry.shortCompact, idx);
}

/** True when the in-memory catalog already has this product code. */
export function posSearchCatalogHasCode(productCode) {
  const code = String(productCode ?? "");
  return Boolean(code && catalogByCode?.has(code));
}

/**
 * Resolve candidate entry indexes via exact / prefix postings.
 * @param {string} query
 * @returns {number[]|null} null = full scan
 */
function candidateEntryIndexes(query) {
  if (!indexedEntries?.length || !prefixIndex) return null;
  const raw = String(query ?? "").trim();
  if (!raw) return null;

  const q = normalizeSearchText(raw);

  // Exact code/barcode/sku — tiny candidate set.
  if (q.compact && exactCodeIndex?.has(q.compact)) {
    return exactCodeIndex.get(q.compact) ?? [];
  }

  // Price search needs a full pass (no useful prefix).
  if (parseAmountSearchTerm(raw) != null) return null;

  if (q.compact.length < 2) return null;

  const keys = new Set();
  keys.add(q.compact.slice(0, 2));
  for (const token of q.tokens) {
    if (token.length >= 2) keys.add(token.slice(0, 2));
  }

  const set = new Set();
  for (const key of keys) {
    const bucket = prefixIndex.get(key);
    if (!bucket) continue;
    for (const idx of bucket) set.add(idx);
  }
  // Empty prefix set → full scan (first-2-char typos like "psaghetti").
  if (!set.size) return null;
  return [...set];
}

/**
 * @param {string} query
 * @param {{ limit?: number, getAvailableQty?: Function }} [options]
 */
function resolveCandidates(query, options = {}) {
  const indexes = candidateEntryIndexes(query);
  const candidates =
    indexes == null
      ? indexedEntries ?? []
      : indexes.map((i) => indexedEntries[i]).filter(Boolean);
  return candidates;
}

/**
 * Fast in-memory search (main thread). Returns products (not entries).
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
  const candidates = resolveCandidates(query, options);

  return rankPosProductSearchResults(candidates, query, {
    limit,
    getAvailableQty: getQty,
  });
}

/** @type {Worker|null} */
let searchWorker = null;
/** @type {number} */
let searchWorkerReqId = 0;
/** @type {Map<number, { resolve: Function, reject: Function }>} */
const searchWorkerPending = new Map();

function getSearchWorker() {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (searchWorker) return searchWorker;
  try {
    searchWorker = new Worker(new URL("./pos-product-search.worker.js", import.meta.url));
    searchWorker.onmessage = (event) => {
      const { id, products, error } = event.data ?? {};
      const pending = searchWorkerPending.get(id);
      if (!pending) return;
      searchWorkerPending.delete(id);
      if (error) pending.reject(new Error(error));
      else pending.resolve(products ?? []);
    };
    searchWorker.onerror = () => {
      for (const [, pending] of searchWorkerPending) {
        pending.reject(new Error("POS search worker failed"));
      }
      searchWorkerPending.clear();
      searchWorker?.terminate();
      searchWorker = null;
    };
  } catch {
    searchWorker = null;
  }
  return searchWorker;
}

/**
 * Async search — offloads ranking to a Worker for huge candidate sets.
 * Falls back to sync when Worker unavailable, qty scorer needed, or set is small.
 * @param {string} query
 * @param {{
 *   limit?: number,
 *   getAvailableQty?: (product: object) => number | null | undefined,
 * }} [options]
 * @returns {Promise<object[]>}
 */
export async function searchPosCatalogIndexAsync(query, options = {}) {
  if (!indexedEntries?.length) return [];
  if (typeof options.getAvailableQty === "function") {
    return searchPosCatalogIndex(query, options);
  }

  const candidates = resolveCandidates(query, options);
  const limit = options.limit ?? 40;
  if (candidates.length < POS_SEARCH_WORKER_MIN_CANDIDATES) {
    return rankPosProductSearchResults(candidates, query, { limit });
  }

  const worker = getSearchWorker();
  if (!worker) {
    return rankPosProductSearchResults(candidates, query, { limit });
  }

  const id = ++searchWorkerReqId;
  // Detach nested product refs for structured clone; worker returns product_codes order.
  const payloadEntries = candidates.map(serializeEntry);
  return new Promise((resolve, reject) => {
    searchWorkerPending.set(id, {
      resolve: (codes) => {
        const byCode = new Map(candidates.map((e) => [String(e.product_code), e.product ?? e]));
        resolve((codes ?? []).map((code) => byCode.get(String(code))).filter(Boolean));
      },
      reject,
    });
    try {
      worker.postMessage({ id, query, limit, entries: payloadEntries });
    } catch (err) {
      searchWorkerPending.delete(id);
      resolve(rankPosProductSearchResults(candidates, query, { limit }));
    }
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

/** Test helper — clear in-memory index. */
export function resetPosSearchCatalogForTests() {
  catalogByCode = null;
  entryByCode = null;
  indexedEntries = null;
  prefixIndex = null;
  exactCodeIndex = null;
  indexWarmedAt = null;
  catalogVersion += 1;
}
