/**
 * POS product search: multi-token match, light fuzzy, relevance + in-stock ranking.
 * Used by offline catalog, API result re-rank, and merge of local + remote hits.
 */

const STRONG_BARCODE_RE = /^\d{6,}$/;

/** @param {string} query */
export function tokenizeSearchQuery(query) {
  return String(query ?? "")
    .trim()
    .toLowerCase()
    .split(/[\s,;|/]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Parse a money-like search token (1500, 1,500.00, KES 2500).
 * @param {string} term
 * @returns {number | null}
 */
export function parseAmountSearchTerm(term) {
  const trimmed = String(term ?? "").trim();
  if (!trimmed) return null;
  if (!/^(?:kes|ksh|sh|usd|\$)?\s*[\d,]+(?:\.\d{1,2})?$/i.test(trimmed)) return null;
  const normalized = trimmed.replace(/,/g, "").replace(/[^\d.]/g, "");
  if (!normalized || !Number.isFinite(Number(normalized))) return null;
  return Math.round(Number(normalized) * 100) / 100;
}

/** @param {object} product */
function productPriceAmounts(product) {
  const out = [];
  for (const key of ["unit_price", "last_selling_price", "selling_price", "price"]) {
    const n = Number(product?.[key]);
    if (!Number.isFinite(n) || n <= 0) continue;
    const rounded = Math.round(n * 100) / 100;
    if (!out.includes(rounded)) out.push(rounded);
  }
  return out;
}

/** @param {object} product */
export function productSearchHaystack(product) {
  const code = String(product?.product_code ?? "").toLowerCase();
  const name = String(product?.product_name ?? "").toLowerCase();
  const shelf = String(product?.shelf_location ?? "").toLowerCase();
  const sku = String(product?.sku ?? product?.barcode ?? "").toLowerCase();
  return {
    code,
    name,
    shelf,
    sku,
    words: name.split(/[^a-z0-9]+/).filter(Boolean),
    prices: productPriceAmounts(product),
  };
}

/**
 * @param {string} a
 * @param {string} b
 */
export function levenshteinDistance(a, b) {
  const s = String(a ?? "");
  const t = String(b ?? "");
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;
  if (Math.abs(s.length - t.length) > 2) return 99;

  const prev = new Array(t.length + 1);
  const cur = new Array(t.length + 1);
  for (let j = 0; j <= t.length; j += 1) prev[j] = j;
  for (let i = 1; i <= s.length; i += 1) {
    cur[0] = i;
    const sc = s.charCodeAt(i - 1);
    for (let j = 1; j <= t.length; j += 1) {
      const cost = sc === t.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= t.length; j += 1) prev[j] = cur[j];
  }
  return prev[t.length];
}

/** @param {string} token */
function maxFuzzyDistance(token) {
  const len = token.length;
  if (len < 3) return 0;
  if (len <= 5) return 1;
  return 2;
}

/**
 * @param {string} token
 * @param {{ code: string, name: string, shelf: string, sku: string, words: string[], prices: number[] }} hay
 */
function tokenMatchKind(token, hay) {
  if (!token) return null;
  if (hay.code === token) return "exact_code";
  if (hay.code.startsWith(token)) return "code_prefix";
  if (hay.name === token) return "exact_name";
  if (hay.words.includes(token)) return "exact_word";
  if (hay.name.startsWith(token)) return "name_prefix";
  if (hay.words.some((word) => word.startsWith(token))) return "word_prefix";
  if (hay.code.includes(token)) return "code_contains";
  if (hay.name.includes(token)) return "name_contains";
  if (hay.sku && hay.sku.includes(token)) return "sku_contains";
  if (hay.shelf && hay.shelf.includes(token)) return "shelf_contains";

  const amount = parseAmountSearchTerm(token);
  if (amount != null && (hay.prices ?? []).includes(amount)) return "exact_price";

  const maxDist = maxFuzzyDistance(token);
  if (maxDist <= 0) return null;

  // Fuzzy is for typos / short abbreviations of a product token — never match a
  // shorter catalog word against a longer query ("marai" must not hit "Mara").
  if (
    hay.code.length >= 3 &&
    token.length <= hay.code.length &&
    Math.abs(hay.code.length - token.length) <= 2 &&
    levenshteinDistance(token, hay.code) <= maxDist
  ) {
    return "fuzzy_code";
  }
  for (const word of hay.words) {
    if (word.length < 3) continue;
    if (token.length > word.length) continue;
    if (Math.abs(word.length - token.length) > 2) continue;
    if (levenshteinDistance(token, word) <= maxDist) return "fuzzy_name";
  }
  return null;
}

const KIND_SCORE = {
  exact_code: 100,
  code_prefix: 82,
  exact_name: 74,
  exact_word: 72,
  exact_price: 70,
  name_prefix: 64,
  word_prefix: 60,
  code_contains: 52,
  name_contains: 44,
  sku_contains: 36,
  shelf_contains: 32,
  fuzzy_code: 28,
  fuzzy_name: 24,
};

/** Soft matches only — drop these when any solid hit exists for the same query. */
function isFuzzyOnlyKinds(kinds) {
  return kinds.length > 0 && kinds.every((kind) => kind.startsWith("fuzzy"));
}

/**
 * @param {object} product
 * @param {string} query
 * @returns {string[]}
 */
function matchKindsForQuery(product, query) {
  const raw = String(query ?? "").trim();
  const fullAmount = parseAmountSearchTerm(raw);
  const tokens = fullAmount != null ? [raw.toLowerCase()] : tokenizeSearchQuery(query);
  if (!tokens.length) return [];
  const hay = productSearchHaystack(product);
  const kinds = [];
  for (const token of tokens) {
    const kind = tokenMatchKind(token, hay);
    if (!kind) return [];
    kinds.push(kind);
  }
  return kinds;
}

/**
 * @param {object} product
 * @param {string} query
 * @param {{ availableQty?: number | null }} [options]
 */
export function scorePosProductSearch(product, query, options = {}) {
  const raw = String(query ?? "").trim();
  const fullAmount = parseAmountSearchTerm(raw);
  // Money-like queries (6,300 / KES 2500): keep as one token so commas are not split.
  const tokens = fullAmount != null ? [raw.toLowerCase()] : tokenizeSearchQuery(query);
  if (!tokens.length) return 0;

  const hay = productSearchHaystack(product);
  const kinds = [];
  for (const token of tokens) {
    const kind = tokenMatchKind(token, hay);
    if (!kind) return 0;
    kinds.push(kind);
  }

  // Multi-token: average token scores, boost when all tokens hit.
  const base =
    kinds.reduce((sum, kind) => sum + (KIND_SCORE[kind] ?? 0), 0) / kinds.length;
  let score = tokens.length > 1 ? base + 8 : base;

  // Whole-query exact / prefix still wins hard.
  const full = raw.toLowerCase();
  if (hay.code === full) score = Math.max(score, 100);
  else if (hay.code.startsWith(full)) score = Math.max(score, 88);
  else if (hay.name === full) score = Math.max(score, 78);
  else if (hay.name.startsWith(full)) score = Math.max(score, 68);
  else if (fullAmount != null && (hay.prices ?? []).includes(fullAmount)) {
    score = Math.max(score, 70);
  }

  const qty = options.availableQty;
  if (qty != null && Number.isFinite(Number(qty))) {
    const n = Number(qty);
    if (n > 0) score += 12;
    else if (n < 0) score -= 8;
    else score -= 2;
  }

  return score;
}

/**
 * @param {object} product
 * @param {string} query
 */
export function productMatchesPosSearch(product, query) {
  if (!product?.product_code) return false;
  const q = String(query ?? "").trim();
  if (!q) return false;
  // Long numeric barcodes: exact / prefix code only (avoid fuzzy noise).
  if (STRONG_BARCODE_RE.test(q)) {
    const code = String(product.product_code).toLowerCase();
    const needle = q.toLowerCase();
    return code === needle || code.startsWith(needle);
  }
  return scorePosProductSearch(product, q) > 0;
}

/**
 * @param {object} product
 * @param {string} query
 * @returns {"code"|"name"|"shelf"|"price"|"fuzzy"|null}
 */
export function explainPosSearchMatch(product, query) {
  const raw = String(query ?? "").trim();
  const fullAmount = parseAmountSearchTerm(raw);
  const tokens = fullAmount != null ? [raw.toLowerCase()] : tokenizeSearchQuery(query);
  if (!tokens.length) return null;
  const hay = productSearchHaystack(product);
  const kinds = tokens.map((t) => tokenMatchKind(t, hay)).filter(Boolean);
  if (!kinds.length) return null;
  if (kinds.some((k) => k.startsWith("fuzzy"))) return "fuzzy";
  if (kinds.some((k) => k.includes("shelf"))) return "shelf";
  if (kinds.some((k) => k.includes("code") || k.includes("sku"))) return "code";
  if (kinds.some((k) => k.includes("price"))) return "price";
  return "name";
}

/**
 * @param {object[]} products
 * @param {string} query
 * @param {{
 *   limit?: number,
 *   getAvailableQty?: (product: object) => number | null | undefined,
 * }} [options]
 */
export function rankPosProductSearchResults(products, query, options = {}) {
  const limit = options.limit ?? 40;
  const getQty = options.getAvailableQty;
  let scored = [];
  for (const product of products ?? []) {
    if (!product?.product_code) continue;
    const availableQty = getQty ? getQty(product) : null;
    const kinds = matchKindsForQuery(product, query);
    if (!kinds.length) continue;
    const score = scorePosProductSearch(product, query, { availableQty });
    if (score <= 0) continue;
    scored.push({
      product,
      score,
      availableQty: availableQty ?? null,
      fuzzyOnly: isFuzzyOnlyKinds(kinds),
    });
  }
  // If anything matches solidly (prefix / word / contains), hide fuzzy near-misses.
  if (scored.some((row) => !row.fuzzyOnly)) {
    scored = scored.filter((row) => !row.fuzzyOnly);
  }
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aq = a.availableQty;
    const bq = b.availableQty;
    if (aq != null && bq != null && aq !== bq) return bq - aq;
    const an = String(a.product.product_name ?? "");
    const bn = String(b.product.product_name ?? "");
    return an.localeCompare(bn);
  });
  return scored.slice(0, limit).map((row) => row.product);
}

/**
 * Prefer remote fields (live stock/price) while keeping local-only fuzzy hits.
 * @param {object[]} localList
 * @param {object[]} remoteList
 * @param {string} query
 * @param {{
 *   limit?: number,
 *   getAvailableQty?: (product: object) => number | null | undefined,
 * }} [options]
 */
export function mergePosSearchResults(localList, remoteList, query, options = {}) {
  const byCode = new Map();
  for (const product of localList ?? []) {
    const code = String(product?.product_code ?? "");
    if (!code) continue;
    byCode.set(code, product);
  }
  for (const product of remoteList ?? []) {
    const code = String(product?.product_code ?? "");
    if (!code) continue;
    const prev = byCode.get(code);
    byCode.set(code, prev ? { ...prev, ...product } : product);
  }
  return rankPosProductSearchResults([...byCode.values()], query, options);
}
