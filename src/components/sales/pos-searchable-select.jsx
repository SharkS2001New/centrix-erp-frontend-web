"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const defaultInputCls =
  "w-full rounded border border-[#c4b89a] bg-white px-2 py-1.5 text-sm text-black outline-none placeholder:text-slate-500 focus:border-[#185FA5]";

const LIST_MAX_HEIGHT = 200;
const SEARCH_HEADER_HEIGHT = 44;
const MENU_GAP = 4;
const PANEL_MAX_HEIGHT = LIST_MAX_HEIGHT + SEARCH_HEADER_HEIGHT;

/**
 * Select-style dropdown with an in-panel search field (credit customers, etc.).
 * Pass `loadOptions` for server-side search; otherwise filters `options` locally.
 */
export function PosSearchableSelect({
  value,
  onChange,
  options = [],
  placeholder = "— Select —",
  searchPlaceholder = "Search…",
  required = false,
  disabled = false,
  loading = false,
  emptyLabel = "No matches",
  idleSearchLabel = "Type to search…",
  minSearchLength = 1,
  loadOptions,
  searchError = null,
  inputClassName = defaultInputCls,
  triggerRef,
  onTriggerKeyDown,
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const searchSeq = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState(null);
  const [asyncOptions, setAsyncOptions] = useState([]);
  const [asyncLoading, setAsyncLoading] = useState(false);
  const [asyncError, setAsyncError] = useState(null);

  const asyncSearch = typeof loadOptions === "function";

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value],
  );

  const filtered = useMemo(() => {
    if (asyncSearch) return asyncOptions;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const text = (o.searchText ?? o.label).toLowerCase();
      return text.includes(q);
    });
  }, [asyncOptions, asyncSearch, options, query]);

  const runSearch = useCallback(
    async (term) => {
      if (!asyncSearch) return;
      const q = term.trim();
      if (q.length < minSearchLength) {
        setAsyncOptions([]);
        setAsyncLoading(false);
        setAsyncError(null);
        return;
      }

      const seq = ++searchSeq.current;
      setAsyncLoading(true);
      setAsyncError(null);
      try {
        const rows = await loadOptions(q);
        if (seq !== searchSeq.current) return;
        setAsyncOptions(Array.isArray(rows) ? rows : []);
      } catch (err) {
        if (seq !== searchSeq.current) return;
        setAsyncOptions([]);
        setAsyncError(err instanceof Error ? err.message : "Search failed");
      } finally {
        if (seq === searchSeq.current) setAsyncLoading(false);
      }
    },
    [asyncSearch, loadOptions, minSearchLength],
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setAsyncOptions([]);
      setAsyncLoading(false);
      setAsyncError(null);
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !asyncSearch) return undefined;
    const t = window.setTimeout(() => {
      void runSearch(query);
    }, 280);
    return () => window.clearTimeout(t);
  }, [asyncSearch, open, query, runSearch]);

  useEffect(() => {
    if (!open || !rootRef.current) {
      setMenuStyle(null);
      return;
    }

    function updateMenuPosition() {
      const anchor = rootRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP;
      const spaceAbove = rect.top - MENU_GAP;
      const openUp =
        spaceBelow < Math.min(PANEL_MAX_HEIGHT, 180) && spaceAbove > spaceBelow;
      const available = openUp ? spaceAbove : spaceBelow;
      const panelHeight = Math.max(
        SEARCH_HEADER_HEIGHT + 80,
        Math.min(PANEL_MAX_HEIGHT, available),
      );
      const listHeight = panelHeight - SEARCH_HEADER_HEIGHT;

      setMenuStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
        zIndex: 60,
        height: panelHeight,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + MENU_GAP }
          : { top: rect.bottom + MENU_GAP }),
        listHeight,
      });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, filtered.length, asyncLoading, asyncError, searchError]);

  useEffect(() => {
    function onDocClick(e) {
      if (rootRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(option) {
    onChange(String(option.value), option);
    setOpen(false);
  }

  function clearSelection(e) {
    e.stopPropagation();
    onChange("", null);
    setOpen(false);
  }

  function toggleOpen() {
    if (disabled) return;
    setOpen((prev) => !prev);
  }

  const listBusy = loading || asyncLoading;
  const listError = searchError || asyncError;
  const trimmedQuery = query.trim();
  const queryTooShort = asyncSearch && trimmedQuery.length < minSearchLength;

  let listMessage = emptyLabel;
  if (queryTooShort) listMessage = idleSearchLabel;
  else if (listBusy) listMessage = "Searching…";
  else if (listError) listMessage = listError;

  const triggerLabel = loading
    ? "Loading…"
    : selected?.label ?? placeholder;

  const panel =
    open && !disabled && menuStyle ? (
      <div
        ref={panelRef}
        style={{
          position: menuStyle.position,
          left: menuStyle.left,
          width: menuStyle.width,
          height: menuStyle.height,
          zIndex: menuStyle.zIndex,
          ...(menuStyle.top != null ? { top: menuStyle.top } : {}),
          ...(menuStyle.bottom != null ? { bottom: menuStyle.bottom } : {}),
        }}
        className="flex flex-col overflow-hidden rounded-lg border border-[#c4b89a] bg-white shadow-lg"
      >
        <div className="shrink-0 border-b border-[#e8dfd0] p-2">
          <input
            ref={searchRef}
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setOpen(false);
              }
            }}
            className="w-full rounded border border-[#c4b89a] bg-white px-2 py-1.5 text-sm text-black outline-none placeholder:text-slate-500 focus:border-[#185FA5]"
          />
        </div>
        <ul
          id={listId}
          role="listbox"
          style={{ maxHeight: menuStyle.listHeight }}
          className="min-h-0 flex-1 overflow-auto py-1"
        >
          {filtered.length === 0 ? (
            <li className={`px-3 py-2 text-sm ${listError ? "text-red-600" : "text-slate-500"}`}>
              {listMessage}
            </li>
          ) : (
            filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={String(o.value) === String(value)}
                  onClick={() => pick(o)}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-[#f3ebe0] ${
                    String(o.value) === String(value)
                      ? "bg-[#E6F1FB] font-medium text-[#185FA5]"
                      : "text-slate-800"
                  }`}
                >
                  {o.label}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled || loading}
        onClick={toggleOpen}
        onKeyDown={onTriggerKeyDown}
        className={`${inputClassName} flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60`}
      >
        <span className={`min-w-0 flex-1 truncate ${selected ? "text-black" : "text-slate-500"}`}>
          {triggerLabel}
        </span>
        <span aria-hidden className="shrink-0 text-xs text-slate-500">
          {open ? "▲" : "▼"}
        </span>
      </button>
      {value && !disabled && !loading ? (
        <button
          type="button"
          onClick={clearSelection}
          className="absolute right-7 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          aria-label="Clear selection"
        >
          ×
        </button>
      ) : null}
      {required && !value ? (
        <input
          tabIndex={-1}
          aria-hidden
          required
          value=""
          onChange={() => {}}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      ) : null}
      {mounted && panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
