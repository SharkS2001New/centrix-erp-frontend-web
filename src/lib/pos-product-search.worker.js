/**
 * POS product search ranking worker — keeps huge-catalog ranking off the UI thread.
 * Receives serialized index entries (no nested product) and returns ordered product_codes.
 */

import { rankPosProductSearchResults } from "@/lib/pos-product-search-rank";

self.onmessage = (event) => {
  const { id, query, limit, entries } = event.data ?? {};
  try {
    const ranked = rankPosProductSearchResults(entries ?? [], query, {
      limit: limit ?? 40,
    });
    const products = ranked.map((row) => String(row?.product_code ?? "")).filter(Boolean);
    self.postMessage({ id, products });
  } catch (err) {
    self.postMessage({
      id,
      error: err instanceof Error ? err.message : "Search worker error",
    });
  }
};
