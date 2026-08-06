/**
 * POS product search engine: normalization, token/compact matching, ranking.
 * Works on raw products or precomputed index entries from pos-product-search-index.
 */

const STRONG_BARCODE_RE = /^\d{6,}$/;
const PUNCT_RE = /[-/.,'’"()]+/g;

/**
 * Normalize searchable text: lowercase, strip punctuation, collapse spaces, compact form.
 * @param {string} value
 * @returns {{ normalized: string, compact: string, tokens: string[] }}
 */
export function normalizeSearchText(value) {
  const normalized = String(value ?? "")
    .toLowerCase()
    .replace(PUNCT_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
  const compact = normalized.replace(/\s+/g, "");
  const tokens = normalized ? normalized.split(" ").filter(Boolean) : [];
  return { normalized, compact, tokens };
}

/** @param {string} query */
export function tokenizeSearchQuery(query) {
  return normalizeSearchText(query).tokens;
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

/**
 * Build a haystack from a raw product (legacy path) or reuse an index entry.
 * @param {object} productOrEntry
 */
export function productSearchHaystack(productOrEntry) {
  if (productOrEntry && Array.isArray(productOrEntry.words) && productOrEntry.nameCompact != null) {
    return productOrEntry;
  }
  const product = productOrEntry;
  const nameNorm = normalizeSearchText(product?.product_name);
  const codeNorm = normalizeSearchText(product?.product_code);
  const skuNorm = normalizeSearchText(product?.sku ?? product?.barcode);
  const shelfNorm = normalizeSearchText(product?.shelf_location);
  const barcodeNorm = normalizeSearchText(product?.barcode ?? product?.alternate_barcode);
  const shortNorm = normalizeSearchText(product?.short_code);
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
 * @param {object} hay
 * @returns {string | null}
 */
function tokenMatchKind(token, hay) {
  if (!token) return null;

  if (hay.barcode && hay.barcode === token) return "exact_barcode";
  if (hay.barcodeCompact && hay.barcodeCompact === token) return "exact_barcode";
  if (hay.code === token || hay.codeCompact === token) return "exact_code";
  if (hay.sku && (hay.sku === token || hay.skuCompact === token)) return "exact_sku";
  if (hay.shortCode && (hay.shortCode === token || hay.shortCompact === token)) return "exact_sku";
  if (hay.name === token) return "exact_name";
  if (hay.words.includes(token)) return "exact_word";

  if (hay.code.startsWith(token) || hay.codeCompact.startsWith(token)) return "code_prefix";
  if (hay.name.startsWith(token)) return "name_prefix";
  if (hay.words.some((word) => word.startsWith(token))) return "word_prefix";

  if (hay.code.includes(token) || hay.codeCompact.includes(token)) return "code_contains";
  if (hay.name.includes(token) || hay.nameCompact.includes(token)) return "name_contains";
  if (hay.sku && (hay.sku.includes(token) || hay.skuCompact?.includes(token))) return "sku_contains";
  if (hay.barcode && (hay.barcode.includes(token) || hay.barcodeCompact?.includes(token))) {
    return "sku_contains";
  }
  if (hay.shelf && hay.shelf.includes(token)) return "shelf_contains";

  const amount = parseAmountSearchTerm(token);
  if (amount != null && (hay.prices ?? []).includes(amount)) return "exact_price";

  const maxDist = maxFuzzyDistance(token);
  if (maxDist <= 0) return null;

  const candidates = [
    hay.codeCompact || hay.code,
    ...(hay.words ?? []),
    hay.skuCompact || hay.sku,
    hay.barcodeCompact || hay.barcode,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (String(candidate).length < 3) continue;
    // Allow query slightly longer/shorter than catalog token (maraii → marai, postmn → postman).
    if (Math.abs(candidate.length - token.length) > 2) continue;
    if (levenshteinDistance(token, candidate) <= maxDist) {
      return candidate === hay.code || candidate === hay.codeCompact ? "fuzzy_code" : "fuzzy_name";
    }
  }
  return null;
}

const KIND_SCORE = {
  exact_barcode: 100,
  exact_code: 100,
  exact_sku: 98,
  exact_name: 96,
  exact_word: 94,
  exact_price: 70,
  code_prefix: 88,
  name_prefix: 86,
  word_prefix: 80,
  code_contains: 52,
  name_contains: 48,
  sku_contains: 44,
  shelf_contains: 32,
  fuzzy_code: 28,
  fuzzy_name: 24,
  compact_match: 84,
  tokens_all: 70,
};

function isFuzzyOnlyKinds(kinds) {
  return kinds.length > 0 && kinds.every((kind) => kind.startsWith("fuzzy"));
}

function isStrongWholeQueryHit(kinds, fullCompact, hay) {
  if (!fullCompact) return false;
  if (hay.nameCompact === fullCompact || hay.name === fullCompact) return true;
  if (hay.words.includes(fullCompact)) return true;
  if (hay.codeCompact === fullCompact || hay.code === fullCompact) return true;
  if (hay.barcodeCompact === fullCompact || hay.barcode === fullCompact) return true;
  return kinds.some((k) =>
    k === "exact_name" ||
    k === "exact_word" ||
    k === "exact_code" ||
    k === "exact_barcode" ||
    k === "exact_sku",
  );
}

/**
 * @param {object} hay
 * @param {string} query
 * @returns {string[]}
 */
function matchKindsForIndexed(hay, query) {
  const raw = String(query ?? "").trim();
  if (!raw) return [];

  if (STRONG_BARCODE_RE.test(raw)) {
    const needle = raw.toLowerCase();
    if (
      hay.code === needle ||
      hay.codeCompact === needle ||
      hay.barcode === needle ||
      hay.barcodeCompact === needle ||
      hay.sku === needle ||
      hay.skuCompact === needle
    ) {
      return ["exact_barcode"];
    }
    if (
      hay.code.startsWith(needle) ||
      hay.codeCompact.startsWith(needle) ||
      (hay.barcode && hay.barcode.startsWith(needle))
    ) {
      return ["code_prefix"];
    }
    return [];
  }

  const amount = parseAmountSearchTerm(raw);
  if (amount != null) {
    if ((hay.prices ?? []).includes(amount)) return ["exact_price"];
  }

  const q = normalizeSearchText(raw);
  if (!q.compact) return [];

  // Spacing-insensitive: "P ostman" / "post man" / "POSTMAN" → same compact hit.
  if (q.compact.length >= 3) {
    if (hay.codeCompact === q.compact || hay.barcodeCompact === q.compact || hay.skuCompact === q.compact) {
      return ["exact_code"];
    }
    if (hay.nameCompact === q.compact) return ["exact_name"];
    if (hay.words.includes(q.compact)) return ["exact_word"];
    if (hay.nameCompact.startsWith(q.compact) || hay.codeCompact.startsWith(q.compact)) {
      return ["name_prefix"];
    }
    if (hay.nameCompact.includes(q.compact) || hay.codeCompact.includes(q.compact)) {
      return ["compact_match"];
    }
  }

  const tokens = q.tokens.length ? q.tokens : [q.compact];
  const kinds = [];
  for (const token of tokens) {
    const kind = tokenMatchKind(token, hay);
    if (!kind) {
      // Phrase / near-phrase: "kiss kid" inside "kiss kids …"
      if (tokens.length > 1 && (hay.name.includes(q.normalized) || hay.nameCompact.includes(q.compact))) {
        return tokens.map(() => "name_contains");
      }
      return [];
    }
    kinds.push(kind);
  }
  if (tokens.length > 1) kinds.push("tokens_all");
  return kinds;
}

/**
 * @param {object} entry index entry or haystack
 * @param {string} query
 */
export function productMatchesIndexedQuery(entry, query) {
  return matchKindsForIndexed(entry, query).length > 0;
}

/**
 * @param {object} entry
 * @param {string} query
 * @param {{ fuzzyOnly?: boolean }} [options]
 */
export function scoreIndexedProduct(entry, query, options = {}) {
  const kinds = matchKindsForIndexed(entry, query);
  if (!kinds.length) return 0;
  if (options.fuzzyOnly === false && isFuzzyOnlyKinds(kinds)) return 0;

  const base =
    kinds.reduce((sum, kind) => sum + (KIND_SCORE[kind] ?? 0), 0) / Math.max(kinds.length, 1);
  let score = base;

  const q = normalizeSearchText(query);
  if (entry.barcodeCompact && entry.barcodeCompact === q.compact) score = Math.max(score, 100);
  else if (entry.codeCompact === q.compact) score = Math.max(score, 100);
  else if (entry.skuCompact === q.compact) score = Math.max(score, 98);
  else if (entry.nameCompact === q.compact) score = Math.max(score, 96);
  else if (entry.words?.includes(q.compact) || entry.words?.includes(q.normalized)) {
    score = Math.max(score, 94);
  } else if (entry.name?.startsWith(q.normalized) || entry.nameCompact?.startsWith(q.compact)) {
    score = Math.max(score, 86);
  }

  return score;
}

/**
 * @param {object} product
 * @param {string} query
 * @param {{ availableQty?: number | null }} [options]
 */
export function scorePosProductSearch(product, query, options = {}) {
  void options;
  return scoreIndexedProduct(productSearchHaystack(product), query);
}

/**
 * @param {object} product
 * @param {string} query
 */
export function productMatchesPosSearch(product, query) {
  if (!product?.product_code) return false;
  const q = String(query ?? "").trim();
  if (!q) return false;
  return productMatchesIndexedQuery(productSearchHaystack(product), q);
}

/**
 * @param {object} product
 * @param {string} query
 * @returns {"code"|"name"|"shelf"|"price"|"fuzzy"|null}
 */
export function explainPosSearchMatch(product, query) {
  const kinds = matchKindsForIndexed(productSearchHaystack(product), query);
  if (!kinds.length) return null;
  if (kinds.some((k) => k.startsWith("fuzzy"))) return "fuzzy";
  if (kinds.some((k) => k.includes("shelf"))) return "shelf";
  if (kinds.some((k) => k.includes("code") || k.includes("sku") || k.includes("barcode"))) {
    return "code";
  }
  if (kinds.some((k) => k.includes("price"))) return "price";
  return "name";
}

/**
 * @param {object[]} products
 * @param {string} query
 * @param {{
 *   limit?: number,
 *   getAvailableQty?: (product: object) => number | null | undefined,
 *   indexedByCode?: Record<string, object>,
 * }} [options]
 */
export function rankPosProductSearchResults(products, query, options = {}) {
  const limit = options.limit ?? 40;
  const getQty = options.getAvailableQty;
  const indexedByCode = options.indexedByCode ?? null;
  const q = normalizeSearchText(query);
  const fullCompact = q.compact;

  let scored = [];
  for (const product of products ?? []) {
    if (!product?.product_code) continue;
    const hay =
      indexedByCode?.[String(product.product_code)] ?? productSearchHaystack(product);
    const kinds = matchKindsForIndexed(hay, query);
    if (!kinds.length) continue;
    const score = scoreIndexedProduct(hay, query);
    if (score <= 0) continue;
    const availableQty = getQty ? getQty(product) : null;
    scored.push({
      product,
      score,
      availableQty: availableQty ?? null,
      fuzzyOnly: isFuzzyOnlyKinds(kinds),
      strongHit: isStrongWholeQueryHit(kinds, fullCompact, hay),
      nameStarts: Boolean(
        hay.name?.startsWith(q.normalized) || hay.nameCompact?.startsWith(fullCompact),
      ),
    });
  }

  if (scored.some((row) => !row.fuzzyOnly)) {
    scored = scored.filter((row) => !row.fuzzyOnly);
  }

  // Finished typing an exact product word (marai) → keep exact hits first-class.
  if (fullCompact.length >= 4 && scored.some((row) => row.strongHit)) {
    const strong = scored.filter((row) => row.strongHit);
    // Still allow longer names that start with the exact word (Marai Rice).
    const startsWithExact = scored.filter(
      (row) => !row.strongHit && row.nameStarts && row.score >= KIND_SCORE.name_prefix,
    );
    scored = strong.length ? [...strong, ...startsWithExact.filter((r) => !strong.includes(r))] : scored;
    // Prefer strong-only when any exact word/name/code hit exists.
    if (strong.length) scored = strong;
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.nameStarts !== b.nameStarts) return a.nameStarts ? -1 : 1;
    const aq = a.availableQty;
    const bq = b.availableQty;
    const aIn = aq != null && Number(aq) > 0 ? 1 : 0;
    const bIn = bq != null && Number(bq) > 0 ? 1 : 0;
    if (bIn !== aIn) return bIn - aIn;
    const an = String(a.product.product_name ?? "");
    const bn = String(b.product.product_name ?? "");
    const byName = an.localeCompare(bn);
    if (byName !== 0) return byName;
    return String(a.product.product_code ?? "").localeCompare(String(b.product.product_code ?? ""));
  });

  return scored.slice(0, limit).map((row) => row.product);
}

/**
 * Prefer remote fields while keeping local list order stable (no flicker).
 * @param {object[]} localList
 * @param {object[]} remoteList
 * @param {string} query
 * @param {{
 *   limit?: number,
 *   getAvailableQty?: (product: object) => number | null | undefined,
 * }} [options]
 */
export function mergePosSearchResults(localList, remoteList, query, options = {}) {
  const limit = options.limit ?? 40;
  const byCode = new Map();
  for (const product of localList ?? []) {
    const code = String(product?.product_code ?? "");
    if (!code) continue;
    byCode.set(code, product);
  }

  const remoteOnly = [];
  for (const product of remoteList ?? []) {
    const code = String(product?.product_code ?? "");
    if (!code) continue;
    const prev = byCode.get(code);
    if (prev) byCode.set(code, { ...prev, ...product });
    else remoteOnly.push(product);
  }

  if (!(localList ?? []).length) {
    return rankPosProductSearchResults([...byCode.values(), ...remoteOnly], query, options);
  }

  const preserved = [];
  const seen = new Set();
  for (const product of localList ?? []) {
    const code = String(product?.product_code ?? "");
    if (!code || seen.has(code)) continue;
    const updated = byCode.get(code);
    if (!updated) continue;
    if (!productMatchesPosSearch(updated, query)) continue;
    preserved.push(updated);
    seen.add(code);
  }

  const appended = rankPosProductSearchResults(remoteOnly, query, options).filter(
    (product) => !seen.has(String(product.product_code ?? "")),
  );

  return [...preserved, ...appended].slice(0, limit);
}
