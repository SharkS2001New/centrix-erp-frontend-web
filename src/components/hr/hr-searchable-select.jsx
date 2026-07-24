"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inputClassName } from "@/components/catalog/catalog-shared";

/**
 * Filterable dropdown for long option lists (employees, etc.).
 * Menu is portaled + fixed so it is not clipped by overflow parents (e.g. employee form tabs).
 */
export function HrSearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Search or select…",
  required = false,
  disabled = false,
  emptyLabel = "No matches",
  inputClassName: inputClassNameProp,
}) {
  const listId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [menuBox, setMenuBox] = useState(null);

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => String(o.label ?? "").toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setMenuBox(null);
    }
  }, [open]);

  useLayoutEffect(() => {
    if (!open || !inputRef.current) return;

    function updatePosition() {
      const rect = inputRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxHeight = 224; // max-h-56
      const gap = 4;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const spaceAbove = rect.top - gap;
      const openUp = spaceBelow < Math.min(maxHeight, 160) && spaceAbove > spaceBelow;
      const height = Math.min(maxHeight, openUp ? spaceAbove : spaceBelow);
      setMenuBox({
        left: rect.left,
        width: rect.width,
        top: openUp ? undefined : rect.bottom + gap,
        bottom: openUp ? window.innerHeight - rect.top + gap : undefined,
        maxHeight: Math.max(120, height),
      });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, filtered.length]);

  useEffect(() => {
    function onDocClick(e) {
      const t = e.target;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  function pick(option) {
    onChange(String(option.value));
    setSearch("");
    setOpen(false);
  }

  function clearSelection() {
    onChange("");
    setSearch("");
    setOpen(false);
  }

  const inputValue = open ? search : (selected?.label ?? "");
  const fieldClassName = inputClassNameProp ?? inputClassName();

  const menu =
    open && !disabled && menuBox && typeof document !== "undefined"
      ? createPortal(
          <ul
            ref={menuRef}
            id={listId}
            role="listbox"
            style={{
              position: "fixed",
              left: menuBox.left,
              width: menuBox.width,
              top: menuBox.top,
              bottom: menuBox.bottom,
              maxHeight: menuBox.maxHeight,
              zIndex: 80,
            }}
            className="overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
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
                    className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                      String(o.value) === String(value)
                        ? "bg-[#E6F1FB] font-medium text-[#185FA5]"
                        : "text-slate-800"
                    }`}
                  >
                    {o.label || "—"}
                  </button>
                </li>
              ))
            )}
          </ul>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={inputValue}
          placeholder={placeholder}
          disabled={disabled}
          required={required && !value}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
            if (!e.target.value.trim()) onChange("");
          }}
          onFocus={() => {
            setOpen(true);
            setSearch("");
          }}
          className={fieldClassName}
        />
        {value ? (
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
      {menu}
    </div>
  );
}
