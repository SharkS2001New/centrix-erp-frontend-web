"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

const defaultInputCls =
  "w-full rounded border border-[#c4b89a] bg-white px-2 py-1.5 text-sm text-black outline-none placeholder:text-slate-500 focus:border-[#185FA5]";

const LIST_MAX_HEIGHT = 200;
const SEARCH_HEADER_HEIGHT = 44;
const MENU_GAP = 4;
const PANEL_MAX_HEIGHT = LIST_MAX_HEIGHT + SEARCH_HEADER_HEIGHT;

/**
 * Select-style dropdown with an in-panel search field (credit customers, etc.).
 */
export function PosSearchableSelect({
  value,
  onChange,
  options,
  placeholder = "— Select —",
  searchPlaceholder = "Search…",
  required = false,
  disabled = false,
  loading = false,
  emptyLabel = "No matches",
  inputClassName = defaultInputCls,
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const searchRef = useRef(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState(null);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const text = (o.searchText ?? o.label).toLowerCase();
      return text.includes(q);
    });
  }, [options, query]);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      return;
    }
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

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
  }, [open, filtered.length]);

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
    onChange(String(option.value));
    setOpen(false);
  }

  function clearSelection(e) {
    e.stopPropagation();
    onChange("");
    setOpen(false);
  }

  function toggleOpen() {
    if (disabled || loading) return;
    setOpen((prev) => !prev);
  }

  const triggerLabel = loading
    ? "Loading…"
    : selected?.label ?? placeholder;

  const panel =
    open && !disabled && !loading && menuStyle ? (
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
            <li className="px-3 py-2 text-sm text-slate-500">{emptyLabel}</li>
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
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        disabled={disabled || loading}
        onClick={toggleOpen}
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
