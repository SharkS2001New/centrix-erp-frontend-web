"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatMixedStockDisplay } from "@/lib/stock-uom";
import { posListUnitPrice } from "@/lib/pos-line";
import { isExactProductCodeQuery } from "@/lib/pos-cart-merge";

import { INPUT_CLASS } from "@/components/catalog/catalog-shared";

const fieldInput = INPUT_CLASS;

function formatStockQty(baseQty, product) {
  const { text } = formatMixedStockDisplay(
    baseQty,
    product?.uom ?? product?.conversion_factor ?? 1,
    product?.package_name,
  );
  return text;
}

export function PosProductSearch({
  query,
  onQueryChange,
  results,
  searching,
  selectedCode,
  sellWholesale,
  retailByCode,
  onSelect,
  onBarcodeEnter,
  barcodeEnabled = false,
  stockDisplayMode = "both",
  disabled = false,
  placeholder = "Search by product name or code…",
  inputRef,
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const optionRefs = useRef(new Map());
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);

  const exactBarcodeMatch =
    barcodeEnabled &&
    results.some((product) => isExactProductCodeQuery(query, product.product_code));

  useEffect(() => {
    setHighlight(-1);
  }, [query]);

  useEffect(() => {
    setHighlight((i) => (results.length === 0 ? -1 : Math.min(i, results.length - 1)));
  }, [results.length]);

  useEffect(() => {
    if (!open || highlight < 0 || !results.length) return;
    optionRefs.current.get(highlight)?.scrollIntoView({ block: "nearest" });
  }, [highlight, open, results.length]);

  useEffect(() => {
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const showDropdown = open && !disabled && !(barcodeEnabled && exactBarcodeMatch);

  function pick(product) {
    onSelect?.(product);
    onQueryChange(product.product_name ?? "");
    setOpen(false);
  }

  function pickHighlighted() {
    if (!results.length) return;
    const index = highlight >= 0 ? highlight : 0;
    const product = results[index];
    if (product) pick(product);
  }

  function moveHighlight(delta) {
    if (!results.length) return;
    setHighlight((i) => {
      const next = (i < 0 ? -1 : i) + delta;
      return Math.max(0, Math.min(next, results.length - 1));
    });
  }

  async function handleInputKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
      moveHighlight(1);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
      moveHighlight(-1);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      if (barcodeEnabled && onBarcodeEnter) {
        const handled = await onBarcodeEnter(query.trim());
        if (handled) {
          setOpen(false);
          return;
        }
      }
      if (open && results.length && !searching) {
        pickHighlighted();
        return;
      }
      if (query.trim()) setOpen(true);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    }
  }

  const searchLabel = barcodeEnabled ? "Search / scan product" : "Search product";
  const searchPlaceholder = barcodeEnabled
    ? "Scan barcode or search by name…"
    : placeholder;

  const showShopStock = stockDisplayMode === "both" || stockDisplayMode === "shop";
  const showStoreStock = stockDisplayMode === "both" || stockDisplayMode === "store";
  const stockColCount = (showShopStock ? 1 : 0) + (showStoreStock ? 1 : 0);
  const tableColSpan = 2 + stockColCount;

  return (
    <div ref={rootRef} className="relative space-y-1">
      <label className="block text-[10px] font-bold uppercase tracking-wide text-[var(--theme-accent-text)]">
        {searchLabel}
      </label>
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        className={fieldInput}
        value={query}
        disabled={disabled}
        placeholder={searchPlaceholder}
        onChange={(e) => {
          onQueryChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (!disabled) setOpen(true);
        }}
        onKeyDown={handleInputKeyDown}
      />

      {showDropdown ? (
        <div
          id={listId}
          ref={listRef}
          role="listbox"
          className="theme-panel absolute left-0 right-0 z-[100] mt-1 max-h-[min(50vh,320px)] overflow-auto rounded-lg border shadow-lg"
        >
          <table className="theme-table w-full border-collapse text-[11px]">
            <thead className="theme-table-head sticky top-0 z-10">
              <tr className="theme-table-head-row text-left font-bold">
                <th className="px-2 py-1.5">Product name</th>
                <th className="px-2 py-1.5 text-right">Unit price</th>
                {showShopStock ? (
                  <th className="px-2 py-1.5 text-right">Stock in shop</th>
                ) : null}
                {showStoreStock ? (
                  <th className="px-2 py-1.5 text-right">Stock in store</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {searching ? (
                <tr>
                  <td colSpan={tableColSpan} className="theme-subtext px-2 py-4 text-center">
                    Searching…
                  </td>
                </tr>
              ) : !query.trim() ? (
                <tr>
                  <td colSpan={tableColSpan} className="theme-subtext px-2 py-4 text-center">
                    {barcodeEnabled ? "Scan a barcode or type a product name" : "Type a product name or code"}
                  </td>
                </tr>
              ) : results.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="theme-subtext px-2 py-4 text-center">
                    No products found
                  </td>
                </tr>
              ) : (
                results.map((product, index) => {
                  const keyboardActive = highlight === index;
                  const selected = selectedCode === product.product_code;
                  const price = posListUnitPrice(
                    product,
                    sellWholesale,
                    retailByCode[product.product_code],
                  );
                  return (
                    <tr
                      key={product.product_code}
                      ref={(el) => {
                        if (el) optionRefs.current.set(index, el);
                        else optionRefs.current.delete(index);
                      }}
                      role="option"
                      aria-selected={keyboardActive || selected}
                      onMouseEnter={() => setHighlight(index)}
                      onClick={() => pick(product)}
                      className={`theme-table-row cursor-pointer border-b border-[var(--theme-border)] ${
                        keyboardActive
                          ? "bg-[var(--theme-primary-subtle)] ring-1 ring-inset ring-[var(--theme-primary)]"
                          : selected
                            ? "bg-[var(--theme-primary-muted)]"
                            : "hover:bg-[var(--theme-hover)]"
                      }`}
                    >
                      <td className="px-2 py-1.5 font-medium text-slate-900">
                        {product.product_name}
                        <span className="mt-0.5 block font-mono text-[10px] font-normal text-slate-500">
                          {product.product_code}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {Number(price).toLocaleString()}
                      </td>
                      {showShopStock ? (
                        <td className="px-2 py-1.5 text-right text-slate-600">
                          {formatStockQty(product.stock_in_shop, product)}
                        </td>
                      ) : null}
                      {showStoreStock ? (
                        <td className="px-2 py-1.5 text-right text-slate-600">
                          {formatStockQty(product.stock_in_store, product)}
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
