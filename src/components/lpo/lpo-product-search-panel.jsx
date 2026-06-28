"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { inputClassName } from "@/components/catalog/catalog-shared";
import { formatMixedStockDisplay } from "@/lib/stock-uom";
import { enrichProductForLpo } from "./lpo-product-utils";

function formatStock(baseQty, product) {
  const { text } = formatMixedStockDisplay(
    baseQty,
    product.uom ?? product.conversion_factor ?? 1,
    product.package_name,
  );
  return text;
}

/**
 * Product finder used on Create LPO — search by name/code, table with shop/store stock.
 */
export function LpoProductSearchPanel({
  uomById,
  vatById = new Map(),
  onSelect,
  actionLabel = "Add selected to order",
  hint = "Click a row to select, double-click or use the button to add.",
  /** When false, search stays open after choose (caller shows add bar). */
  clearOnSelect = true,
  disabled = false,
  resultsMaxHeight = "max-h-[min(52vh,520px)]",
  /** Cap scroll area ~half viewport; height grows with rows until cap (supplier return page). */
  compactHalfPage = false,
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);
  const searchSeq = useRef(0);
  const uomByIdRef = useRef(uomById);
  const vatByIdRef = useRef(vatById);

  useEffect(() => {
    uomByIdRef.current = uomById;
    vatByIdRef.current = vatById;
  }, [uomById, vatById]);

  const searchProducts = useCallback(async (q) => {
    const trimmed = q.trim();
    const seq = ++searchSeq.current;

    if (trimmed.length < 1) {
      setResults([]);
      setSearchError(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    setSearchError(null);
    try {
      const res = await apiRequest("/products", {
        searchParams: { per_page: 80, q: trimmed },
      });
      if (seq !== searchSeq.current) return;

      const list = (res.data ?? []).map((p) =>
        enrichProductForLpo(p, uomByIdRef.current, vatByIdRef.current),
      );
      setResults(list.slice(0, 40));
    } catch {
      if (seq !== searchSeq.current) return;
      setSearchError("Could not search products.");
      setResults([]);
    } finally {
      if (seq === searchSeq.current) setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchProducts(query), 280);
    return () => clearTimeout(t);
  }, [query, searchProducts]);

  function clearProductSearch() {
    searchSeq.current += 1;
    setSearching(false);
    setQuery("");
    setResults([]);
    setSelectedCode(null);
    setSearchError(null);
  }

  function confirmSelect(product) {
    if (!product || disabled) return;
    onSelect?.(product);
    if (clearOnSelect) clearProductSearch();
  }

  function confirmSelected() {
    const product = results.find((p) => p.product_code === selectedCode);
    if (product) confirmSelect(product);
  }

  const scrollClass = compactHalfPage
    ? "max-h-[min(42vh,400px)] overflow-auto"
    : `${resultsMaxHeight} overflow-auto`;

  const rootClass = disabled ? "pointer-events-none opacity-60" : undefined;
  const showEmpty = results.length === 0;
  const emptyMessage = query.trim() ? "No products found." : "Type to search products.";

  return (
    <div className={rootClass}>
      <div className="mb-2 flex shrink-0 gap-2">
        <input
          className={`${inputClassName()} min-w-0 flex-1`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find product by name or code…"
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirmSelected();
            }
          }}
        />
        <button
          type="button"
          onClick={() => searchProducts(query)}
          disabled={disabled}
          className="theme-secondary-btn shrink-0 rounded-lg px-3 text-sm font-medium shadow-sm disabled:opacity-40"
        >
          Find
        </button>
      </div>
      {searchError ? <p className="mb-2 text-xs text-red-600">{searchError}</p> : null}
      <div className="theme-table-shell relative overflow-hidden rounded-lg border">
        {searching ? (
          <div className="theme-subtext pointer-events-none absolute right-2 top-2 z-20 rounded bg-[var(--theme-page-bg)]/90 px-1.5 py-0.5 text-[10px]">
            Searching…
          </div>
        ) : null}
        <div className={`${scrollClass} min-h-[220px]`}>
          <table className="theme-table w-full border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-[var(--theme-surface-muted)]">
              <tr className="theme-table-head-row text-left font-semibold">
                <th className="px-2 py-2">Product Name</th>
                <th className="px-2 py-2 text-right">Current Stock in Shop</th>
                <th className="px-2 py-2 text-right">Current Stock in Store</th>
              </tr>
            </thead>
            <tbody>
              {showEmpty ? (
                <tr>
                  <td colSpan={3} className="theme-subtext px-2 py-6 text-center">
                    {searching && query.trim() ? "Searching…" : emptyMessage}
                  </td>
                </tr>
              ) : (
                results.map((product) => {
                  const selected = selectedCode === product.product_code;
                  return (
                    <tr
                      key={product.product_code}
                      onClick={() => setSelectedCode(product.product_code)}
                      onDoubleClick={() => confirmSelect(product)}
                      className={`theme-table-body-row cursor-pointer border-b border-[var(--theme-border)] ${
                        selected ? "bg-[var(--theme-primary-subtle)]" : "hover:bg-[var(--theme-hover)]"
                      }`}
                    >
                      <td className="px-2 py-2 font-medium">
                        {product.product_name}
                        <span className="theme-subtext mt-0.5 block font-mono text-[10px] font-normal">
                          {product.product_code}
                        </span>
                      </td>
                      <td className="theme-text-muted px-2 py-2 text-right">
                        {formatStock(product.stock_in_shop, product)}
                      </td>
                      <td className="theme-text-muted px-2 py-2 text-right">
                        {formatStock(product.stock_in_store, product)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      <button
        type="button"
        onClick={confirmSelected}
        disabled={!selectedCode || disabled}
        className="theme-primary-btn mt-2 w-full shrink-0 rounded-lg py-2 text-sm font-medium shadow-sm disabled:opacity-40"
      >
        {actionLabel}
      </button>
      <p className="theme-subtext mt-1 shrink-0 text-[11px]">{hint}</p>
    </div>
  );
}
