"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { enrichProductForLpo } from "@/components/lpo/lpo-product-utils";
import { formatSaleKes } from "@/lib/sales";
import { formatMixedStockDisplay } from "@/lib/stock-uom";
import { posListUnitPrice } from "@/lib/pos-line";

function ModalShell({ title, open, onClose, children, widthClass = "max-w-md" }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${widthClass} rounded-xl border border-slate-200 bg-white p-4 shadow-xl dark:border-slate-600 dark:bg-slate-800`}
        data-pos-shortcut-ignore="true"
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function PosCalculatorModal({ open, onClose }) {
  const [display, setDisplay] = useState("0");
  const [stored, setStored] = useState(null);
  const [op, setOp] = useState(null);

  useEffect(() => {
    if (open) {
      setDisplay("0");
      setStored(null);
      setOp(null);
    }
  }, [open]);

  function inputDigit(digit) {
    setDisplay((prev) => (prev === "0" ? digit : `${prev}${digit}`));
  }

  function inputDot() {
    setDisplay((prev) => (prev.includes(".") ? prev : `${prev}.`));
  }

  function clearAll() {
    setDisplay("0");
    setStored(null);
    setOp(null);
  }

  function applyOp(nextOp) {
    const current = Number(display);
    if (stored == null || op == null) {
      setStored(current);
      setOp(nextOp);
      setDisplay("0");
      return;
    }
    const result = compute(stored, current, op);
    setDisplay(String(result));
    setStored(result);
    setOp(nextOp);
  }

  function equals() {
    if (stored == null || op == null) return;
    const result = compute(stored, Number(display), op);
    setDisplay(String(result));
    setStored(null);
    setOp(null);
  }

  function compute(a, b, operator) {
    switch (operator) {
      case "+":
        return a + b;
      case "-":
        return a - b;
      case "*":
        return a * b;
      case "/":
        return b === 0 ? 0 : a / b;
      default:
        return b;
    }
  }

  function onKey(label) {
    if (label === "C") return clearAll();
    if (label === "=") return equals();
    if (label === "+") return applyOp("+");
    if (label === "−") return applyOp("-");
    if (label === "×") return applyOp("*");
    if (label === "÷") return applyOp("/");
    if (label === ".") return inputDot();
    return inputDigit(label);
  }

  return (
    <ModalShell title="Calculator (F5)" open={open} onClose={onClose} widthClass="max-w-xs">
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right text-2xl font-semibold tabular-nums text-slate-900 dark:border-slate-600 dark:bg-slate-900 dark:text-white">
        {display}
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {["C", "÷", "×", "−", "7", "8", "9", "+", "4", "5", "6", "=", "1", "2", "3", "=", "0", ".", "="].map(
          (label, index) => (
            <button
              key={`${label}-${index}`}
              type="button"
              onClick={() => onKey(label)}
              className={`rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-700 ${
                label === "=" ? "col-span-1 row-span-1 bg-[var(--theme-primary)] text-white hover:bg-[var(--theme-primary-hover)]" : "bg-white dark:bg-slate-800"
              } ${label === "0" ? "col-span-2" : ""}`}
            >
              {label}
            </button>
          ),
        )}
      </div>
    </ModalShell>
  );
}

export function PosPriceCheckerModal({ open, onClose, sellWholesale, retailByCode, uomById, vatById }) {
  const MIN_QUERY_LEN = 3;
  const SEARCH_DEBOUNCE_MS = 350;

  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setSuggestions([]);
      setSelected(null);
      setError(null);
      searchSeq.current += 1;
    }
  }, [open]);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LEN) {
      searchSeq.current += 1;
      setSuggestions([]);
      setLoading(false);
      if (trimmed.length === 0) {
        setError(null);
        setSelected(null);
      }
      return undefined;
    }

    const seq = ++searchSeq.current;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiRequest("/products", {
          searchParams: { per_page: 12, q: trimmed },
        });
        if (seq !== searchSeq.current) return;
        const uomMap = uomById ?? new Map();
        const vatMap = vatById ?? new Map();
        const list = (res.data ?? []).map((p) => enrichProductForLpo(p, uomMap, vatMap));
        setSuggestions(list);
        setError(list.length === 0 ? "No matching products." : null);
      } catch (e) {
        if (seq !== searchSeq.current) return;
        setSuggestions([]);
        setError(e instanceof ApiError ? e.message : "Search failed");
      } finally {
        if (seq === searchSeq.current) setLoading(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [query, uomById, vatById]);

  function selectProduct(product) {
    setSelected(product);
    setError(null);
  }

  async function lookupExact() {
    const trimmed = query.trim();
    if (!trimmed) return;

    if (selected?.product_code === trimmed) return;

    const exactSuggestion = suggestions.find(
      (p) => String(p.product_code).toLowerCase() === trimmed.toLowerCase(),
    );
    if (exactSuggestion) {
      selectProduct(exactSuggestion);
      return;
    }

    if (suggestions.length === 1) {
      selectProduct(suggestions[0]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const uomMap = uomById ?? new Map();
      const vatMap = vatById ?? new Map();
      let row = null;
      try {
        row = await apiRequest(`/products/${encodeURIComponent(trimmed)}`);
      } catch {
        if (trimmed.length >= MIN_QUERY_LEN) {
          const res = await apiRequest("/products", { searchParams: { per_page: 1, q: trimmed } });
          row = (res.data ?? [])[0] ?? null;
        }
      }
      if (!row) {
        setError(trimmed.length < MIN_QUERY_LEN ? "Type at least 3 characters to search." : "No product found.");
        return;
      }
      selectProduct(enrichProductForLpo(row, uomMap, vatMap));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  const product = selected;
  const price = product
    ? posListUnitPrice(product, sellWholesale, retailByCode?.[product.product_code])
    : null;

  return (
    <ModalShell title="Price checker (F9)" open={open} onClose={onClose} widthClass="max-w-2xl">
      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        Type at least 3 characters to search. Select a product to view price and stock.
      </p>
      <div className="flex gap-2">
        <input
          className="theme-input flex-1 rounded-lg border px-3 py-2 text-sm"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void lookupExact();
            }
          }}
          placeholder="Scan or type product code / name"
          autoFocus
        />
        <button
          type="button"
          disabled={loading || !query.trim()}
          onClick={() => void lookupExact()}
          className="shrink-0 rounded-lg bg-[var(--theme-primary)] px-3 py-2 text-xs font-semibold text-white hover:bg-[var(--theme-primary-hover)] disabled:opacity-50"
        >
          {loading ? "…" : "Check"}
        </button>
      </div>

      {query.trim().length > 0 && query.trim().length < MIN_QUERY_LEN ? (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Keep typing — search starts after {MIN_QUERY_LEN} characters.
        </p>
      ) : null}

      {loading && suggestions.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Searching…</p>
      ) : null}

      {error && !product ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>
      ) : null}

      {suggestions.length > 0 && !product ? (
        <ul className="mt-3 max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-600">
          {suggestions.map((item) => (
            <li key={item.product_code} className="border-b border-slate-100 last:border-0 dark:border-slate-700">
              <button
                type="button"
                onClick={() => selectProduct(item)}
                className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--theme-primary-muted)]/60 dark:hover:bg-slate-700/60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                    {item.product_name}
                  </span>
                  <span className="font-mono text-xs text-slate-500">{item.product_code}</span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--theme-accent-text)] dark:text-blue-200">
                  {formatSaleKes(
                    posListUnitPrice(item, sellWholesale, retailByCode?.[item.product_code]),
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {product ? (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-600 dark:bg-slate-900/50">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{product.product_name}</p>
              <p className="font-mono text-xs text-slate-500">{product.product_code}</p>
            </div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs font-medium text-[var(--theme-primary)] hover:underline dark:text-blue-300"
            >
              Clear
            </button>
          </div>
          <div className="flex justify-between border-t border-slate-200 pt-2 dark:border-slate-600">
            <span className="text-slate-600 dark:text-slate-300">Unit price</span>
            <span className="text-base font-semibold tabular-nums">{formatSaleKes(price)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-300">Shop stock</span>
            <span>{formatMixedStockDisplay(product.stock_in_shop, product.uom?.conversion_factor ?? 1).text}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600 dark:text-slate-300">Store stock</span>
            <span>{formatMixedStockDisplay(product.stock_in_store, product.uom?.conversion_factor ?? 1).text}</span>
          </div>
        </div>
      ) : null}
    </ModalShell>
  );
}

const SHORTCUT_ROWS = [
  ["F5", "Calculator"],
  ["F8", "New order"],
  ["F9", "Price checker"],
  ["F10", "Complete payment"],
  ["F12", "Retail / wholesale toggle"],
  ["Alt + H", "Hold order"],
  ["Alt + F", "Float details"],
  ["Alt + P", "Print / reprint receipt"],
  ["Delete", "Void selected line"],
  ["Esc", "Focus product search"],
  ["F1", "This shortcuts list"],
];

export function PosKeyboardShortcutsModal({ open, onClose }) {
  return (
    <ModalShell title="POS keyboard shortcuts" open={open} onClose={onClose} widthClass="max-w-sm">
      <div className="space-y-1 text-sm">
        {SHORTCUT_ROWS.map(([key, label]) => (
          <div
            key={key}
            className="flex items-center justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-700"
          >
            <kbd className="rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">
              {key}
            </kbd>
            <span className="text-right text-slate-600 dark:text-slate-300">{label}</span>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

export { SHORTCUT_ROWS };
