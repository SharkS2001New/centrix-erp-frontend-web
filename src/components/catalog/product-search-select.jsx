"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  fetchProductByCodeCached,
  searchProductCatalogCached,
} from "@/lib/catalog-cache";
import { inputClassName } from "@/components/catalog/catalog-shared";

/** Stable default so excludeCodes=[] does not recreate filtered results every render. */
const EMPTY_EXCLUDE_CODES = Object.freeze([]);

/**
 * Searchable product picker — live API search (no client product catalog cache).
 * Arrow Up/Down moves highlight; Enter selects the highlighted result.
 */
export function ProductSearchSelect({
  value,
  onChange,
  /** Called with full product row when user picks from search */
  onProductSelect,
  /** product_codes to hide from results (e.g. already have a setting) */
  excludeCodes = EMPTY_EXCLUDE_CODES,
  /** When set, show this product even if excluded (edit mode) */
  lockedProduct = null,
  disabled = false,
  required = false,
  placeholder = "Search by product name or code…",
  inputClassName: inputClassNameProp,
  className = "",
}) {
  const { user } = useAuth();
  const listId = useId();
  const rootRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const excludeSet = useMemo(
    () => new Set((excludeCodes ?? EMPTY_EXCLUDE_CODES).map(String)),
    [excludeCodes],
  );

  const selected = useMemo(() => {
    if (lockedProduct && String(lockedProduct.product_code) === String(value)) {
      return lockedProduct;
    }
    return results.find((p) => String(p.product_code) === String(value)) ?? null;
  }, [value, results, lockedProduct]);

  const displayLabel = (p) => {
    const name = p?.product_name?.trim();
    const code = p?.product_code ?? "";
    if (name && name !== code) {
      return `${name} (${code})`;
    }
    return code || name || "";
  };

  const searchProducts = useCallback(async (q) => {
    const trimmed = q.trim();
    if (trimmed.length < 1) {
      setResults([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const list = await searchProductCatalogCached(user?.organization_id, trimmed, {
        limit: 50,
        status: "all",
      });
      setResults(list);
    } catch {
      setSearchError("Could not search products.");
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [user?.organization_id]);

  useEffect(() => {
    const t = setTimeout(() => searchProducts(query), 280);
    return () => clearTimeout(t);
  }, [query, searchProducts]);

  useEffect(() => {
    const code = value ? String(value).trim() : "";
    if (!code || disabled) return undefined;

    const hasName = (product) => {
      const name = product?.product_name?.trim();
      return Boolean(name && name !== String(product?.product_code ?? ""));
    };

    if (lockedProduct && String(lockedProduct.product_code) === code && hasName(lockedProduct)) {
      return undefined;
    }

    const fromResults = results.find((p) => String(p.product_code) === code);
    if (fromResults && hasName(fromResults)) {
      return undefined;
    }

    let cancelled = false;
    (async () => {
      try {
        const product = await fetchProductByCodeCached(user?.organization_id, code, {
          status: "all",
        });
        if (cancelled || !product?.product_code || !hasName(product)) return;
        onProductSelect?.(product);
        if (!open) {
          setQuery(displayLabel(product));
        }
      } catch {
        // Product may have been removed — keep code-only display.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [value, disabled, lockedProduct?.product_code, lockedProduct?.product_name, onProductSelect, open, results, user?.organization_id]);

  useEffect(() => {
    if (!open && selected) {
      setQuery(displayLabel(selected));
    }
    if (!open && !value) {
      setQuery("");
    }
  }, [open, selected, value]);

  useEffect(() => {
    function onDocClick(e) {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const filtered = useMemo(() => {
    return results.filter((p) => {
      if (String(p.product_code) === String(value)) return true;
      return !excludeSet.has(String(p.product_code));
    });
  }, [results, excludeSet, value]);

  // Reset highlight when the result set changes — not on every highlight move.
  const resultsSignature = useMemo(
    () => filtered.map((p) => String(p.product_code)).join("\0"),
    [filtered],
  );

  useEffect(() => {
    if (!open || searching || filtered.length === 0) {
      setHighlightIndex(-1);
      return;
    }
    setHighlightIndex(0);
  }, [open, searching, resultsSignature, filtered.length]);

  useEffect(() => {
    if (highlightIndex < 0 || !listRef.current) return;
    const option = listRef.current.querySelector(`[data-option-index="${highlightIndex}"]`);
    option?.scrollIntoView?.({ block: "nearest" });
  }, [highlightIndex]);

  function pick(product) {
    onChange(product.product_code);
    onProductSelect?.(product);
    setQuery(displayLabel(product));
    setOpen(false);
    setHighlightIndex(-1);
  }

  function clearSelection() {
    onChange("");
    setQuery("");
    setResults([]);
    setOpen(false);
    setHighlightIndex(-1);
  }

  function onInputKeyDown(e) {
    if (disabled) return;

    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        setHighlightIndex(-1);
      }
      return;
    }

    const canNavigate = open && !searching && filtered.length > 0;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (!open) {
        setOpen(true);
        return;
      }
      if (!canNavigate) return;
      setHighlightIndex((prev) => (prev < 0 ? 0 : (prev + 1) % filtered.length));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (!canNavigate) return;
      setHighlightIndex((prev) =>
        prev <= 0 ? filtered.length - 1 : prev - 1,
      );
      return;
    }

    if (e.key === "Enter") {
      if (!canNavigate) return;
      const index = highlightIndex >= 0 ? highlightIndex : 0;
      const product = filtered[index];
      if (!product) return;
      e.preventDefault();
      e.stopPropagation();
      pick(product);
    }
  }

  const fieldClassName = inputClassNameProp ?? inputClassName();
  const activeOptionId =
    highlightIndex >= 0 && filtered[highlightIndex]
      ? `${listId}-opt-${highlightIndex}`
      : undefined;

  return (
    <div ref={rootRef} className={`relative w-full ${className}`.trim()}>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeOptionId}
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          required={required && !value}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            if (!e.target.value.trim()) onChange("");
          }}
          onFocus={() => {
            if (!disabled) setOpen(true);
          }}
          onKeyDown={onInputKeyDown}
          className={fieldClassName}
        />
        {value && !disabled ? (
          <button
            type="button"
            onClick={clearSelection}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            aria-label="Clear selection"
          >
            ×
          </button>
        ) : null}
      </div>
      {open && !disabled ? (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="pos-search-select-panel absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border py-1 shadow-lg"
        >
          {searching ? (
            <li className="px-3 py-2 text-sm text-[var(--theme-text-muted)]">Searching…</li>
          ) : searchError ? (
            <li className="px-3 py-2 text-sm text-red-600">{searchError}</li>
          ) : query.trim().length < 1 ? (
            <li className="px-3 py-2 text-sm text-[var(--theme-text-muted)]">
              Type a product name or code
            </li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-[var(--theme-text-muted)]">No products found</li>
          ) : (
            filtered.map((p, index) => {
              const isHighlighted = index === highlightIndex;
              const isSelected = String(p.product_code) === String(value);
              return (
                <li key={p.product_code}>
                  <button
                    type="button"
                    id={`${listId}-opt-${index}`}
                    data-option-index={index}
                    role="option"
                    aria-selected={isHighlighted || isSelected}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onMouseDown={(e) => {
                      // Keep focus on the input so arrow keys keep working after a hover/click attempt.
                      e.preventDefault();
                    }}
                    onClick={() => pick(p)}
                    className={`pos-search-select-option block w-full px-3 py-2 text-left text-sm ${
                      isHighlighted || isSelected ? "pos-search-select-option-active" : ""
                    }`}
                  >
                    <span className="font-medium">{p.product_name}</span>
                    <span className="ml-1.5 font-mono text-xs opacity-80">{p.product_code}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
