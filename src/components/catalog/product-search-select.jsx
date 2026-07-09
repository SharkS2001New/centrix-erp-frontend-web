"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import {
  fetchProductByCodeCached,
  searchProductCatalogCached,
} from "@/lib/catalog-cache";
import { inputClassName } from "@/components/catalog/catalog-shared";

/**
 * Searchable product picker — searches the org product catalog cache (master data only).
 */
export function ProductSearchSelect({
  value,
  onChange,
  /** Called with full product row when user picks from search */
  onProductSelect,
  /** product_codes to hide from results (e.g. already have a setting) */
  excludeCodes = [],
  /** When set, show this product even if excluded (edit mode) */
  lockedProduct = null,
  disabled = false,
  required = false,
  placeholder = "Search by product name or code…",
  inputClassName: inputClassNameProp,
}) {
  const { user } = useAuth();
  const listId = useId();
  const rootRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);

  const excludeSet = useMemo(
    () => new Set((excludeCodes ?? []).map(String)),
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

  function pick(product) {
    onChange(product.product_code);
    onProductSelect?.(product);
    setQuery(displayLabel(product));
    setOpen(false);
  }

  function clearSelection() {
    onChange("");
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  const fieldClassName = inputClassNameProp ?? inputClassName();

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
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
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
        >
          {searching ? (
            <li className="px-3 py-2 text-sm text-slate-500">Searching…</li>
          ) : searchError ? (
            <li className="px-3 py-2 text-sm text-red-600">{searchError}</li>
          ) : query.trim().length < 1 ? (
            <li className="px-3 py-2 text-sm text-slate-500">Type a product name or code</li>
          ) : filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-500">No products found</li>
          ) : (
            filtered.map((p) => (
              <li key={p.product_code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={String(p.product_code) === String(value)}
                  onClick={() => pick(p)}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                    String(p.product_code) === String(value)
                      ? "bg-[#E6F1FB] font-medium text-[#185FA5]"
                      : "text-slate-800"
                  }`}
                >
                  <span className="font-medium">{p.product_name}</span>
                  <span className="ml-1.5 font-mono text-xs text-slate-500">{p.product_code}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
