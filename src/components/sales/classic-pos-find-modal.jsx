"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatMixedStockDisplay } from "@/lib/stock-uom";
import { posListUnitPrice } from "@/lib/pos-line";
import {
  productCartStockDisplayMode,
  productStockAtLocation,
} from "@/lib/pos-stock";
import { isExactProductCodeQuery } from "@/lib/pos-cart-merge";
import { formatOrgCurrency } from "@/lib/format";
import { GENERAL_DEFAULTS } from "@/lib/general-settings";

function formatStockQty(baseQty, product) {
  const { text } = formatMixedStockDisplay(
    baseQty,
    product?.uom ?? product?.conversion_factor ?? 1,
    product?.package_name,
  );
  return text;
}

function availableLabel(product, sellFromShop, posSalesConfig, sellWholesale) {
  const mode = productCartStockDisplayMode(product, posSalesConfig, sellWholesale);
  const shop = productStockAtLocation(product, "shop");
  const store = productStockAtLocation(product, "store");
  const parts = [];
  if (mode === "both" || mode === "shop") {
    parts.push(`${formatStockQty(shop, product)}${mode === "both" ? " shop" : ""}`);
  }
  if (mode === "both" || mode === "store") {
    parts.push(`${formatStockQty(store, product)}${mode === "both" ? " store" : ""}`);
  }
  const primary = sellFromShop ? shop : store;
  return { text: parts.join(" · ") || formatStockQty(primary, product), qty: primary };
}

/**
 * Classic External POS Find window — table lookup like legacy cashier systems.
 */
export function ClassicPosFindModal({
  open,
  onClose,
  query,
  onQueryChange,
  results,
  searching,
  sellWholesale,
  retailByCode,
  sellFromShop = true,
  posSalesConfig = null,
  onSelect,
  onBarcodeEnter,
  barcodeEnabled = false,
  currencySettings = GENERAL_DEFAULTS,
}) {
  const titleId = useId();
  const inputRef = useRef(null);
  const [highlight, setHighlight] = useState(0);

  useEffect(() => {
    if (!open) return undefined;
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select?.();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setHighlight(0);
  }, [query, results.length]);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleFind() {
    const q = query.trim();
    if (!q) return;
    if (barcodeEnabled && onBarcodeEnter) {
      const handled = await onBarcodeEnter(q);
      if (handled) {
        onClose?.();
        return;
      }
    }
    if (results.length === 1) {
      onSelect?.(results[0]);
      onClose?.();
    }
  }

  function pick(product) {
    onSelect?.(product);
    onClose?.();
  }

  function onInputKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => Math.min(i + 1, Math.max(0, results.length - 1)));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (results[highlight]) {
        pick(results[highlight]);
        return;
      }
      void handleFind();
    }
  }

  return (
    <div className="classic-pos-find-overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="classic-pos-find-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="classic-pos-find-title" id={titleId}>
          Find product
        </div>
        <div className="classic-pos-find-toolbar">
          <input
            ref={inputRef}
            className="classic-pos-find-input"
            value={query}
            onChange={(e) => onQueryChange?.(e.target.value)}
            onKeyDown={onInputKeyDown}
            placeholder="Product code or name"
            autoComplete="off"
          />
          <button type="button" className="classic-pos-find-btn" onClick={() => void handleFind()}>
            Find
          </button>
          <button type="button" className="classic-pos-find-btn classic-pos-find-btn--muted" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="classic-pos-find-table-wrap">
          <table className="classic-pos-find-table">
            <thead>
              <tr>
                <th>Product code</th>
                <th>Product name</th>
                <th className="text-right">Unit price</th>
                <th className="text-right">Available</th>
              </tr>
            </thead>
            <tbody>
              {searching && !results.length ? (
                <tr>
                  <td colSpan={4} className="classic-pos-find-empty">
                    Searching…
                  </td>
                </tr>
              ) : null}
              {!searching && !results.length ? (
                <tr>
                  <td colSpan={4} className="classic-pos-find-empty">
                    {query.trim() ? "No products found" : "Type a code or name, then Find"}
                  </td>
                </tr>
              ) : null}
              {results.map((product, index) => {
                const retail = retailByCode?.[product.product_code] ?? null;
                const price = posListUnitPrice(product, sellWholesale, retail);
                const avail = availableLabel(product, sellFromShop, posSalesConfig, sellWholesale);
                const negative = Number(avail.qty) < 0;
                const selected =
                  isExactProductCodeQuery(query, product.product_code) || index === highlight;
                return (
                  <tr
                    key={product.product_code ?? index}
                    className={`${negative ? "classic-pos-find-row--negative" : ""} ${
                      selected ? "classic-pos-find-row--active" : ""
                    }`}
                    onClick={() => pick(product)}
                    onMouseEnter={() => setHighlight(index)}
                  >
                    <td>{product.product_code}</td>
                    <td>{product.product_name}</td>
                    <td className="text-right tabular-nums">
                      {formatOrgCurrency(price, currencySettings)}
                    </td>
                    <td className={`text-right tabular-nums ${negative ? "classic-pos-neg" : ""}`}>
                      {avail.text}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
