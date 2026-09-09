"use client";

import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/contexts/auth-context";
import { isPosFunctionKeyEvent, isPosClassicAltShortcut } from "@/lib/pos-keyboard-shortcuts";
import { formatMixedStockDisplay } from "@/lib/stock-uom";
import { posListUnitPrice } from "@/lib/pos-line";
import {
  productCartStockDisplayMode,
  productStockAtLocation,
} from "@/lib/pos-stock";
import { isPosTouchSearchKeypadEnabled } from "@/lib/pos-touch-search-keypad";
import { productMatchesPosSearch } from "@/lib/pos-product-search-rank";
import { shouldSyncParentSearchQuery } from "@/lib/pos-search-draft-sync";
import { TouchSearchField } from "@/components/pos/touch-search-keypad";

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

function emptySearchGuidance(query, barcodeEnabled) {
  const q = String(query ?? "").trim();
  if (!q) {
    return barcodeEnabled
      ? "Scan a barcode or type a product name"
      : "Type a product name or code";
  }
  return "No products found";
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

export const PosProductSearch = forwardRef(function PosProductSearch(
  {
  query,
  onQueryChange,
  /** Survives remounts when the cart table re-renders — same ref as parent searchQueryRef. */
  persistedDraftRef = null,
  results,
  searching,
  selectedCode,
  sellWholesale,
  retailByCode,
  routeMarkupPerUnit = 0,
  onSelect,
  onBarcodeEnter,
  onEscapeKey = null,
  barcodeEnabled = false,
  stockDisplayMode = "both",
  posSalesConfig = null,
  sellFromShop = true,
  disabled = false,
  /** Blocks pick / Enter / barcode only — typing stays enabled (avoids mid-search wipe). */
  picksDisabled = false,
  /** Hide results while a modal owns the screen (payment, float, etc.). */
  dropdownSuppressed = false,
  placeholder = "Search by product name or code…",
  inputRef = null,
  /** "classic" = embedded column dropdown (no label, Light Stores columns). */
  variant = "modern",
},
  ref,
) {
  const listId = useId();
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const localInputRef = useRef(null);
  const optionRefs = useRef(new Map());
  const [open, setOpen] = useState(false);
  /** User explicitly dismissed results (Esc / pick). Typing resets this. */
  const [userDismissed, setUserDismissed] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const highlightCodeRef = useRef(null);
  const [menuBox, setMenuBox] = useState(null);
  const classic = variant === "classic";
  const { capabilities } = useAuth();
  const touchSearchKeypad = isPosTouchSearchKeypadEnabled(capabilities);
  const enablePosCashRounding = Boolean(posSalesConfig?.enablePosCashRounding);
  const inputLocked = Boolean(disabled);
  const picksLocked = Boolean(picksDisabled || disabled);
  const draftQueryRef = useRef(String(persistedDraftRef?.current ?? query ?? ""));
  const lastEmittedRef = useRef(draftQueryRef.current);
  const allowParentClearRef = useRef(false);
  const inputFocusedRef = useRef(false);
  const mountedRef = useRef(false);
  const [draftQuery, setDraftQuery] = useState(() => draftQueryRef.current);
  const idleQuery = !String(draftQuery ?? "").trim();

  function writeDraft(next, { notifyParent = true, touchDom = true } = {}) {
    const value = String(next ?? "");
    draftQueryRef.current = value;
    lastEmittedRef.current = value;
    if (persistedDraftRef) {
      persistedDraftRef.current = value;
    }
    setDraftQuery(value);
    if (touchDom) {
      const el = localInputRef.current;
      if (el && el.value !== value) {
        el.value = value;
      }
    }
    if (notifyParent) {
      onQueryChange?.(value);
    }
  }

  useImperativeHandle(ref, () => ({
    /** Programmatic hide (overlay/focus churn) — must not block results for an active query. */
    closeDropdown() {
      setOpen(false);
      setHighlight(-1);
    },
    /** Cashier dismissed results (Esc) while keeping the typed query. */
    dismissDropdown() {
      setUserDismissed(true);
      setOpen(false);
      setHighlight(-1);
    },
    /** Parent cleared the query (after add / swap / payment) — bypass focused guard. */
    clearDraft() {
      allowParentClearRef.current = true;
      writeDraft("", { notifyParent: false });
      setHighlight(-1);
      highlightCodeRef.current = null;
    },
    /** Park product code / swap target without notifying parent again. */
    setDraftValue(next) {
      writeDraft(next, { notifyParent: false });
    },
    getDraftValue() {
      return String(localInputRef.current?.value ?? draftQueryRef.current ?? "");
    },
  }));

  function commitDraft(next) {
    writeDraft(next, { notifyParent: true });
  }

  // Restore after remount (cart re-render moves the search slot in classic layout).
  useLayoutEffect(() => {
    const saved = String(
      persistedDraftRef?.current ?? draftQueryRef.current ?? query ?? "",
    );
    writeDraft(saved, { notifyParent: false });
    mountedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount restore only
  }, []);

  // Parent may seed an empty field after clear. Never mirror parent "" or a stale
  // parked code over live typing — that race wiped the draft when searching fast.
  // Depend on `query` only: re-running on focus/blur used to re-apply a lagged parent.
  useEffect(() => {
    if (!mountedRef.current) return;
    const parent = String(query ?? "");
    const local = String(localInputRef.current?.value ?? draftQueryRef.current ?? "");

    if (!shouldSyncParentSearchQuery(parent, local, {
      allowParentClear: allowParentClearRef.current,
    })) {
      return;
    }

    if (parent === "") {
      allowParentClearRef.current = false;
    }

    writeDraft(parent, { notifyParent: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- query-driven sync only
  }, [query]);

  useEffect(() => {
    if (inputLocked && !String(draftQuery ?? "").trim()) {
      setOpen(false);
      setHighlight(-1);
    }
  }, [inputLocked, draftQuery]);

  useEffect(() => {
    if (!classic) return undefined;
    function onFunctionKey(e) {
      if (!isPosFunctionKeyEvent(e)) return;
      if (String(draftQuery ?? "").trim()) return;
      setUserDismissed(true);
      setOpen(false);
      setHighlight(-1);
    }
    window.addEventListener("keydown", onFunctionKey, { capture: true, passive: true });
    return () => window.removeEventListener("keydown", onFunctionKey, { capture: true, passive: true });
  }, [classic, draftQuery]);

  useLayoutEffect(() => {
    assignRef(inputRef, localInputRef.current);
    return () => assignRef(inputRef, null);
  }, [inputRef]);

  const hasActiveQuery = Boolean(String(draftQuery ?? "").trim());
  const visibleResults = useMemo(() => {
    const q = String(draftQuery ?? "").trim();
    if (!q) return [];
    const list = Array.isArray(results) ? results : [];
    if (!list.length) return [];
    const filtered = list.filter((product) => productMatchesPosSearch(product, q));
    if (filtered.length) return filtered;
    // Never blank the list mid-type. While debounce lags (searching=false) or a
    // longer query is in flight, keep the last committed hits until searchProducts
    // replaces them — otherwise yab→yabal / kamand→kamande blinks empty.
    return list;
  }, [results, draftQuery]);
  const dropdownActive = hasActiveQuery ? !userDismissed : open && !inputLocked;
  const showDropdown = dropdownActive && !dropdownSuppressed;

  useEffect(() => {
    if (!hasActiveQuery) {
      highlightCodeRef.current = null;
      setHighlight(-1);
      setUserDismissed(false);
      setOpen(false);
    }
  }, [hasActiveQuery, draftQuery]);

  // Parent overlays (payment, cart save/delete/swap wait) — force the panel shut.
  useEffect(() => {
    if (!dropdownSuppressed) return;
    setOpen(false);
    setHighlight(-1);
  }, [dropdownSuppressed]);

  useEffect(() => {
    if (visibleResults.length === 0) {
      setHighlight(-1);
      return;
    }
    const sticky = highlightCodeRef.current;
    if (sticky) {
      const idx = visibleResults.findIndex((p) => String(p.product_code) === String(sticky));
      if (idx >= 0) {
        setHighlight(idx);
        return;
      }
    }
    setHighlight(0);
    highlightCodeRef.current = visibleResults[0]?.product_code ?? null;
  }, [visibleResults]);

  useEffect(() => {
    if (!hasActiveQuery || userDismissed || dropdownSuppressed) return;
    if (visibleResults.length > 0 || searching) setOpen(true);
  }, [hasActiveQuery, visibleResults, searching, draftQuery, userDismissed, dropdownSuppressed]);

  useEffect(() => {
    if (!dropdownActive || highlight < 0 || !visibleResults.length) return;
    optionRefs.current.get(highlight)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [highlight, dropdownActive, visibleResults.length]);

  function setHighlightAt(index) {
    if (!visibleResults.length) {
      setHighlight(-1);
      highlightCodeRef.current = null;
      return;
    }
    const next = Math.max(0, Math.min(index, visibleResults.length - 1));
    setHighlight(next);
    highlightCodeRef.current = visibleResults[next]?.product_code ?? null;
  }

  useLayoutEffect(() => {
    if (!classic || !dropdownActive || (inputLocked && !hasActiveQuery)) {
      setMenuBox(null);
      return undefined;
    }
    function updateBox() {
      const el = localInputRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const preferred = Math.max(rect.width * 2.6, rect.width + 280);
      const width = Math.min(Math.max(preferred, 520), window.innerWidth - 24);
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
  }, [classic, dropdownActive, inputLocked, hasActiveQuery, visibleResults.length, searching]);

  useEffect(() => {
    function onDocClick(e) {
      if (String(draftQuery ?? "").trim()) return;
      const inRoot = rootRef.current?.contains(e.target);
      const inList = listRef.current?.contains(e.target);
      if (!inRoot && !inList) {
        setUserDismissed(true);
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [draftQuery]);

  function pick(product) {
    if (picksLocked) return;
    onSelect?.(product);
    setUserDismissed(true);
    if (classic) {
      setOpen(false);
      setHighlight(-1);
      highlightCodeRef.current = null;
      return;
    }
    commitDraft(product.product_code ?? product.product_name ?? "");
    setOpen(false);
  }

  function pickHighlighted() {
    if (!visibleResults.length) return;
    const index = highlight >= 0 ? highlight : 0;
    const product = visibleResults[index];
    if (product) pick(product);
  }

  function moveHighlight(delta) {
    if (!visibleResults.length) return;
    const base = highlight < 0 ? -1 : highlight;
    setHighlightAt(base + delta);
  }

  async function handleInputKeyDown(e) {
    if (isPosFunctionKeyEvent(e) || isPosClassicAltShortcut(e)) return;

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
      if (picksLocked) return;
      if (visibleResults.length) {
        setUserDismissed(true);
        setOpen(false);
        pickHighlighted();
        return;
      }
      if (barcodeEnabled && onBarcodeEnter) {
        const handled = await onBarcodeEnter(String(draftQuery ?? "").trim());
        if (handled) {
          setUserDismissed(true);
          setOpen(false);
          return;
        }
      }
      if (String(draftQuery ?? "").trim()) setOpen(true);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (open || (hasActiveQuery && visibleResults.length > 0)) {
        setUserDismissed(true);
        setOpen(false);
        setHighlight(-1);
        highlightCodeRef.current = null;
      } else if (onEscapeKey) {
        onEscapeKey();
      }
      window.requestAnimationFrame(() => {
        const el = localInputRef.current;
        el?.focus({ preventScroll: true });
        el?.select?.();
      });
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
  const modernColSpan = 2 + stockColCountFix(showShopStock, showStoreStock);

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
                  <th className="classic-pos-find-num classic-pos-find-price">Unit price</th>
                  <th className="classic-pos-find-num classic-pos-find-stock">Available</th>
                </tr>
              </thead>
              <tbody>
                {searching && !visibleResults.length ? (
                  <tr>
                    <td colSpan={4} className="classic-pos-find-empty">
                      Searching…
                    </td>
                  </tr>
                ) : idleQuery ? (
                  <tr>
                    <td colSpan={4} className="classic-pos-find-empty">
                      Type a code or name
                    </td>
                  </tr>
                ) : visibleResults.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="classic-pos-find-empty">
                      {emptySearchGuidance(draftQuery, barcodeEnabled)}
                    </td>
                  </tr>
                ) : (
                  visibleResults.map((product, index) => {
                    const keyboardActive = highlight === index;
                    const price = posListUnitPrice(
                      product,
                      sellWholesale,
                      retailByCode[product.product_code],
                      routeMarkupPerUnit,
                      enablePosCashRounding,
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
                        onMouseEnter={() => setHighlightAt(index)}
                        onMouseDown={(e) => {
                          e.preventDefault();
                        }}
                        onClick={() => pick(product)}
                        className={`${negative ? "classic-pos-find-row--negative" : ""} ${
                          keyboardActive ? "classic-pos-find-row--active" : ""
                        }`}
                      >
                        <td>{product.product_code}</td>
                        <td>
                          <span className="classic-pos-find-name">{product.product_name}</span>
                        </td>
                        <td className="classic-pos-find-num classic-pos-find-price">
                          {Number(price).toLocaleString()}
                        </td>
                        <td
                          className={`classic-pos-find-num classic-pos-find-stock ${
                            negative ? "classic-pos-neg" : ""
                          }`}
                        >
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
      <TouchSearchField
        inputRef={localInputRef}
        enabled={touchSearchKeypad}
        uncontrolled={!touchSearchKeypad}
        defaultValue={draftQueryRef.current}
        title="Search product"
        value={draftQuery}
        disabled={inputLocked}
        placeholder={searchPlaceholder}
        className={classic ? "classic-pos-cart-scan-input" : fieldInput}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={(next) => {
          if (inputLocked) return;
          setUserDismissed(false);
          commitDraft(next);
          setOpen(true);
        }}
        onKeyDown={handleInputKeyDown}
        onFocus={() => {
          if (inputLocked) return;
          inputFocusedRef.current = true;
          if (String(draftQuery ?? "").trim()) setUserDismissed(false);
          setOpen(true);
        }}
        onBlur={() => {
          window.requestAnimationFrame(() => {
            const input = localInputRef.current;
            const active =
              typeof document !== "undefined" ? document.activeElement : null;
            if (input && active === input) return;
            if (listRef.current?.contains(active)) return;
            inputFocusedRef.current = false;
          });
        }}
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
              {searching && !visibleResults.length ? (
                <tr>
                  <td colSpan={modernColSpan} className="theme-subtext px-2 py-4 text-center">
                    Searching…
                  </td>
                </tr>
              ) : idleQuery ? (
                <tr>
                  <td colSpan={modernColSpan} className="theme-subtext px-2 py-4 text-center">
                    {emptySearchGuidance("", barcodeEnabled)}
                  </td>
                </tr>
              ) : visibleResults.length === 0 ? (
                <tr>
                  <td colSpan={modernColSpan} className="theme-subtext px-2 py-4 text-center">
                    {emptySearchGuidance(draftQuery, barcodeEnabled)}
                  </td>
                </tr>
              ) : (
                visibleResults.map((product, index) => {
                  const keyboardActive = highlight === index;
                  const selected = selectedCode === product.product_code;
                  const price = posListUnitPrice(
                    product,
                    sellWholesale,
                    retailByCode[product.product_code],
                    routeMarkupPerUnit,
                    enablePosCashRounding,
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
                      onMouseEnter={() => setHighlightAt(index)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                      }}
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
                      <td className="px-2 py-1.5 text-right tabular-nums font-bold">
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
});

function stockColCountFix(showShopStock, showStoreStock) {
  return (showShopStock ? 1 : 0) + (showStoreStock ? 1 : 0);
}
