"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatMixedStockDisplay } from "@/lib/stock-uom";
import { posListUnitPrice } from "@/lib/pos-line";
import {
  productCartStockDisplayMode,
  productStockAtLocation,
} from "@/lib/pos-stock";
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

function availableQty(product, sellFromShop, posSalesConfig, sellWholesale) {
  const mode = productCartStockDisplayMode(product, posSalesConfig, sellWholesale);
  const shop = productStockAtLocation(product, "shop");
  const store = productStockAtLocation(product, "store");
  if (mode === "shop") return shop;
  if (mode === "store") return store;
  return sellFromShop ? shop : store;
}

/** Assign a value to a React ref object or callback without touching component props. */
function assignRef(ref, value) {
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  if (ref != null && typeof ref === "object") {
    ref.current = value;
  }
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
  posSalesConfig = null,
  sellFromShop = true,
  disabled = false,
  placeholder = "Search by product name or code…",
  inputRef = null,
  /** "classic" = embedded column dropdown (no label, Light Stores columns). */
  variant = "modern",
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const localInputRef = useRef(null);
  const optionRefs = useRef(new Map());
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [menuBox, setMenuBox] = useState(null);
  const classic = variant === "classic";

  // Keep parent searchInputRef in sync without mutating props during render.
  useLayoutEffect(() => {
    assignRef(inputRef, localInputRef.current);
    return () => assignRef(inputRef, null);
  }, [inputRef]);

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

  useLayoutEffect(() => {
    if (!classic || !open || disabled) {
      setMenuBox(null);
      return undefined;
    }
    function updateBox() {
      const el = localInputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const width = Math.max(rect.width, Math.min(560, window.innerWidth - 24));
      const spaceBelow = window.innerHeight - rect.bottom - 16;
      const spaceAbove = rect.top - 16;
      const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(
        160,
        Math.min(360, openUp ? spaceAbove : spaceBelow),
      );
      setMenuBox({
        top: openUp ? Math.max(8, rect.top - maxHeight) : rect.bottom + 4,
        left: Math.min(Math.max(8, rect.left), window.innerWidth - width - 8),
        width,
        maxHeight,
      });
    }
    updateBox();
    const raf = requestAnimationFrame(updateBox);
    window.addEventListener("resize", updateBox);
    window.addEventListener("scroll", updateBox, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", updateBox);
      window.removeEventListener("scroll", updateBox, true);
    };
  }, [classic, open, disabled, query, results.length, searching]);

  useEffect(() => {
    function onDocClick(e) {
      const inRoot = rootRef.current?.contains(e.target);
      const inList = listRef.current?.contains(e.target);
      if (!inRoot && !inList) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const showDropdown = open && !disabled && !(barcodeEnabled && exactBarcodeMatch);

  function pick(product) {
    onSelect?.(product);
    onQueryChange(classic ? (product.product_code ?? "") : (product.product_name ?? ""));
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
    if (e.key === "F2" && classic) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(true);
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
    : classic
      ? "Scan / type code…"
      : placeholder;

  const showShopStock = stockDisplayMode === "both" || stockDisplayMode === "shop";
  const showStoreStock = stockDisplayMode === "both" || stockDisplayMode === "store";
  const stockColCount = (showShopStock ? 1 : 0) + (showStoreStock ? 1 : 0);
  const modernColSpan = 2 + stockColCount;

  const classicDropdown =
    classic && showDropdown && menuBox && typeof document !== "undefined"
      ? createPortal(
          <div
            id={listId}
            ref={listRef}
            role="listbox"
            className="classic-pos-scan-dropdown"
            style={{
              position: "fixed",
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
              maxHeight: menuBox.maxHeight,
              zIndex: 10000,
            }}
          >
            <table className="classic-pos-find-table w-full">
              <thead>
                <tr>
                  <th>Product code</th>
                  <th>Product name</th>
                  <th className="text-right">Unit price</th>
                  <th className="text-right">Available</th>
                </tr>
              </thead>
              <tbody>
                {searching ? (
                  <tr>
                    <td colSpan={4} className="classic-pos-find-empty">
                      Searching…
                    </td>
                  </tr>
                ) : !query.trim() ? (
                  <tr>
                    <td colSpan={4} className="classic-pos-find-empty">
                      Type a code or name
                    </td>
                  </tr>
                ) : results.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="classic-pos-find-empty">
                      No products found
                    </td>
                  </tr>
                ) : (
                  results.map((product, index) => {
                    const keyboardActive = highlight === index;
                    const price = posListUnitPrice(
                      product,
                      sellWholesale,
                      retailByCode[product.product_code],
                    );
                    const qty = availableQty(product, sellFromShop, posSalesConfig, sellWholesale);
                    const negative = Number(qty) < 0;
                    return (
                      <tr
                        key={product.product_code}
                        ref={(el) => {
                          if (el) optionRefs.current.set(index, el);
                          else optionRefs.current.delete(index);
                        }}
                        role="option"
                        aria-selected={keyboardActive}
                        onMouseEnter={() => setHighlight(index)}
                        onClick={() => pick(product)}
                        className={`${negative ? "classic-pos-find-row--negative" : ""} ${
                          keyboardActive ? "classic-pos-find-row--active" : ""
                        }`}
                      >
                        <td>{product.product_code}</td>
                        <td>{product.product_name}</td>
                        <td className="text-right tabular-nums">
                          {Number(price).toLocaleString()}
                        </td>
                        <td className={`text-right tabular-nums ${negative ? "classic-pos-neg" : ""}`}>
                          {formatStockQty(qty, product)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={classic ? "classic-pos-scan-lookup relative" : "relative space-y-1"}>
      {classic ? null : (
        <label className="block text-[10px] font-bold uppercase tracking-wide text-[var(--theme-accent-text)]">
          {searchLabel}
        </label>
      )}
      <input
        ref={localInputRef}
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        className={classic ? "classic-pos-cart-scan-input" : fieldInput}
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

      {classic ? classicDropdown : null}

      {!classic && showDropdown ? (
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
                  <th className="px-2 py-1.5 text-right">Available in shop</th>
                ) : null}
                {showStoreStock ? (
                  <th className="px-2 py-1.5 text-right">Available in store</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {searching ? (
                <tr>
                  <td colSpan={modernColSpan} className="theme-subtext px-2 py-4 text-center">
                    Searching…
                  </td>
                </tr>
              ) : !query.trim() ? (
                <tr>
                  <td colSpan={modernColSpan} className="theme-subtext px-2 py-4 text-center">
                    {barcodeEnabled ? "Scan a barcode or type a product name" : "Type a product name or code"}
                  </td>
                </tr>
              ) : results.length === 0 ? (
                <tr>
                  <td colSpan={modernColSpan} className="theme-subtext px-2 py-4 text-center">
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
                          {posSalesConfig &&
                          productCartStockDisplayMode(product, posSalesConfig, sellWholesale) ===
                            "store"
                            ? "—"
                            : formatStockQty(productStockAtLocation(product, "shop"), product)}
                        </td>
                      ) : null}
                      {showStoreStock ? (
                        <td className="px-2 py-1.5 text-right text-slate-600">
                          {formatStockQty(productStockAtLocation(product, "store"), product)}
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
