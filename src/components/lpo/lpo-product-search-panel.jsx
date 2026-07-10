"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { inputClassName } from "@/components/catalog/catalog-shared";
import { TABLE_ROW_CHECKBOX_CLASS } from "@/components/catalog/table-row-selection";
import { formatMixedStockDisplay } from "@/lib/stock-uom";
import { productStockAtLocation } from "@/lib/pos-stock";
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
  branchId: branchIdProp = null,
  onSelect,
  onSelectMany,
  actionLabel = "Add selected to order",
  /** When multiple items are selected, `{n}` is replaced with the count. */
  multiActionLabel,
  hint = "Click a row to select, double-click or use the button to add.",
  /** "multiple" allows checkboxes and batch add; "single" keeps one highlighted row. */
  selectionMode = "single",
  /** When false, search stays open after choose (caller shows add bar). */
  clearOnSelect = true,
  disabled = false,
  resultsMaxHeight = "max-h-[min(52vh,520px)]",
  /** Cap scroll area ~half viewport; height grows with rows until cap (supplier return page). */
  compactHalfPage = false,
}) {
  const { user, isOrgWide } = useAuth();
  const branchId =
    branchIdProp ??
    (user?.branch_id && !isOrgWide() ? user.branch_id : user?.branch_id ?? null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selectedCode, setSelectedCode] = useState(null);
  const [selectedCodes, setSelectedCodes] = useState(() => new Set());
  const searchSeq = useRef(0);
  const uomByIdRef = useRef(uomById);
  const vatByIdRef = useRef(vatById);
  const multiple = selectionMode === "multiple";

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
      const searchParams = { per_page: 80, q: trimmed };
      if (branchId) searchParams.branch_id = branchId;
      const res = await apiRequest("/products", {
        searchParams,
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
  }, [branchId]);

  useEffect(() => {
    const t = setTimeout(() => searchProducts(query), 280);
    return () => clearTimeout(t);
  }, [query, searchProducts]);

  useEffect(() => {
    if (!multiple) return;
    const visible = new Set(results.map((p) => p.product_code));
    setSelectedCodes((prev) => {
      const next = new Set([...prev].filter((code) => visible.has(code)));
      return next.size === prev.size ? prev : next;
    });
  }, [results, multiple]);

  function clearProductSearch() {
    searchSeq.current += 1;
    setSearching(false);
    setQuery("");
    setResults([]);
    setSelectedCode(null);
    setSelectedCodes(new Set());
    setSearchError(null);
  }

  function toggleProductSelection(productCode) {
    if (multiple) {
      setSelectedCodes((prev) => {
        const next = new Set(prev);
        if (next.has(productCode)) next.delete(productCode);
        else next.add(productCode);
        return next;
      });
      return;
    }
    setSelectedCode(productCode);
  }

  function confirmSelect(product) {
    if (!product || disabled) return;
    onSelect?.(product);
    if (clearOnSelect) clearProductSearch();
  }

  function confirmSelected() {
    if (multiple) {
      const selected = results.filter((p) => selectedCodes.has(p.product_code));
      if (!selected.length || disabled) return;
      if (typeof onSelectMany === "function") {
        onSelectMany(selected);
      } else {
        for (const product of selected) {
          onSelect?.(product);
        }
      }
      if (clearOnSelect) clearProductSearch();
      else setSelectedCodes(new Set());
      return;
    }

    const product = results.find((p) => p.product_code === selectedCode);
    if (product) confirmSelect(product);
  }

  const selectedCount = multiple ? selectedCodes.size : selectedCode ? 1 : 0;
  const resultCodes = useMemo(() => results.map((p) => p.product_code), [results]);
  const allResultsSelected =
    multiple && resultCodes.length > 0 && resultCodes.every((code) => selectedCodes.has(code));
  const someResultsSelected =
    multiple &&
    resultCodes.some((code) => selectedCodes.has(code)) &&
    !allResultsSelected;

  function toggleAllResults(checked) {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      for (const code of resultCodes) {
        if (checked) next.add(code);
        else next.delete(code);
      }
      return next;
    });
  }

  const addButtonLabel =
    multiple && selectedCount > 1
      ? (multiActionLabel ?? `Add ${selectedCount} selected to order`).replace(
          "{n}",
          String(selectedCount),
        )
      : actionLabel;

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
                {multiple ? (
                  <th className="w-10 px-2 py-2">
                    <input
                      type="checkbox"
                      className={TABLE_ROW_CHECKBOX_CLASS}
                      checked={allResultsSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someResultsSelected;
                      }}
                      onChange={(e) => toggleAllResults(e.target.checked)}
                      disabled={disabled || !resultCodes.length}
                      title="Select all results"
                      onClick={(e) => e.stopPropagation()}
                    />
                  </th>
                ) : null}
                <th className="px-2 py-2">Product Name</th>
                <th className="px-2 py-2 text-right">Available in Shop</th>
                <th className="px-2 py-2 text-right">Available in Store</th>
              </tr>
            </thead>
            <tbody>
              {showEmpty ? (
                <tr>
                  <td colSpan={multiple ? 4 : 3} className="theme-subtext px-2 py-6 text-center">
                    {searching && query.trim() ? "Searching…" : emptyMessage}
                  </td>
                </tr>
              ) : (
                results.map((product) => {
                  const selected = multiple
                    ? selectedCodes.has(product.product_code)
                    : selectedCode === product.product_code;
                  return (
                    <tr
                      key={product.product_code}
                      onClick={() => toggleProductSelection(product.product_code)}
                      onDoubleClick={() => confirmSelect(product)}
                      className={`theme-table-body-row cursor-pointer border-b border-[var(--theme-border)] ${
                        selected ? "bg-[var(--theme-primary-subtle)]" : "hover:bg-[var(--theme-hover)]"
                      }`}
                    >
                      {multiple ? (
                        <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className={TABLE_ROW_CHECKBOX_CLASS}
                            checked={selected}
                            onChange={() => toggleProductSelection(product.product_code)}
                            disabled={disabled}
                            aria-label={`Select ${product.product_name}`}
                          />
                        </td>
                      ) : null}
                      <td className="px-2 py-2 font-medium">
                        {product.product_name}
                        <span className="theme-subtext mt-0.5 block font-mono text-[10px] font-normal">
                          {product.product_code}
                        </span>
                      </td>
                      <td className="theme-text-muted px-2 py-2 text-right">
                        {formatStock(productStockAtLocation(product, "shop"), product)}
                      </td>
                      <td className="theme-text-muted px-2 py-2 text-right">
                        {formatStock(productStockAtLocation(product, "store"), product)}
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
        disabled={selectedCount === 0 || disabled}
        className="theme-primary-btn mt-2 w-full shrink-0 rounded-lg py-2 text-sm font-medium shadow-sm disabled:opacity-40"
      >
        {addButtonLabel}
      </button>
      <p className="theme-subtext mt-1 shrink-0 text-[11px]">{hint}</p>
    </div>
  );
}
