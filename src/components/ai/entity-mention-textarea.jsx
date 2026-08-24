"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ENTITY_MENTION_TYPES,
  detectMentionTrigger,
  insertMentionAtTrigger,
  pruneEntityRefs,
  searchEntityMentions,
  serializeEntityRefs,
} from "@/lib/ai/entity-mention-search";

const MENU_Z_INDEX = 11000;
const MENU_GAP = 4;
const LIST_MAX_HEIGHT = 240;

/**
 * Textarea with `@` entity autocomplete (products, suppliers, customers, employees, branches).
 *
 * @param {{
 *   value?: string,
 *   entityRefs?: Array<object>,
 *   onChange?: (next: { text: string, entityRefs: Array<object> }) => void,
 *   onSubmit?: (next: { text: string, entityRefs: Array<object> }) => void,
 *   disabled?: boolean,
 *   placeholder?: string,
 *   rows?: number,
 *   className?: string,
 *   textareaClassName?: string,
 *   hint?: string | null,
 *   maxLength?: number,
 * }} props
 */
export function EntityMentionTextarea({
  value = "",
  entityRefs = [],
  onChange,
  onSubmit,
  disabled = false,
  placeholder = "Type @ to pick a product, supplier, or customer…",
  rows = 4,
  className = "",
  textareaClassName = "",
  hint = "Type @ to pick a product, supplier, customer, employee, or branch",
  maxLength,
}) {
  const listId = useId();
  const textareaRef = useRef(null);
  const menuRef = useRef(null);
  const abortRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState(null);
  const [entityType, setEntityType] = useState("product");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [searchError, setSearchError] = useState(null);
  const [menuStyle, setMenuStyle] = useState(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const refs = useMemo(() => serializeEntityRefs(entityRefs), [entityRefs]);

  const emit = useCallback(
    (text, nextRefs, caret = null) => {
      const pruned = pruneEntityRefs(text, nextRefs);
      onChange?.({ text, entityRefs: serializeEntityRefs(pruned) });
      if (caret != null && textareaRef.current) {
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(caret, caret);
        });
      }
    },
    [onChange],
  );

  const closeMenu = useCallback(() => {
    setOpen(false);
    setTrigger(null);
    setOptions([]);
    setHighlight(0);
    setSearchError(null);
    setMenuStyle(null);
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  const refreshTrigger = useCallback(
    (text, caret) => {
      const next = detectMentionTrigger(text, caret);
      if (!next) {
        if (open) closeMenu();
        return;
      }
      setTrigger(next);
      setOpen(true);
    },
    [closeMenu, open],
  );

  useEffect(() => {
    if (!open) return undefined;
    const el = textareaRef.current;
    if (!el) return undefined;

    function updateMenuPosition() {
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP;
      const spaceAbove = rect.top - MENU_GAP;
      const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
      const available = openUp ? spaceAbove : spaceBelow;
      const height = Math.max(160, Math.min(LIST_MAX_HEIGHT + 48, available - 8));
      const width = Math.min(Math.max(rect.width, 280), window.innerWidth - 16);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      setMenuStyle({
        position: "fixed",
        left,
        width,
        zIndex: MENU_Z_INDEX,
        height,
        ...(openUp
          ? { bottom: window.innerHeight - rect.top + MENU_GAP }
          : { top: rect.bottom + MENU_GAP }),
      });
    }

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, value, entityType, options.length, loading]);

  useEffect(() => {
    if (!open || !trigger) return undefined;

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setSearchError(null);

    const run = async () => {
      try {
        const rows = await searchEntityMentions(entityType, trigger.query, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setOptions(rows);
        setHighlight(0);
      } catch (err) {
        if (controller.signal.aborted) return;
        setOptions([]);
        setSearchError(err instanceof Error ? err.message : "Search failed");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    const t = setTimeout(() => void run(), 120);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
  }, [open, trigger?.query, trigger?.start, entityType]);

  function pickOption(option) {
    if (!trigger || !option) return;
    const { text: nextText, caret } = insertMentionAtTrigger(value, trigger, option);
    const nextRefs = [
      ...refs.filter(
        (r) =>
          !(
            r.type === option.type &&
            String(r.id ?? "") === String(option.id ?? "") &&
            String(r.code ?? "") === String(option.code ?? "")
          ),
      ),
      {
        type: option.type,
        id: option.id,
        code: option.code,
        label: option.label,
      },
    ];
    emit(nextText, nextRefs, caret);
    closeMenu();
  }

  function handleChange(e) {
    const next = e.target.value;
    const caret = e.target.selectionStart ?? next.length;
    emit(next, refs);
    refreshTrigger(next, caret);
  }

  function handleSelect(e) {
    const caret = e.target.selectionStart ?? 0;
    refreshTrigger(value, caret);
  }

  function handleKeyDown(e) {
    if (open) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlight((i) => (options.length ? (i + 1) % options.length : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlight((i) => (options.length ? (i - 1 + options.length) % options.length : 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeMenu();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (options[highlight]) pickOption(options[highlight]);
        return;
      }
      if (e.key === "Tab" && options[highlight]) {
        e.preventDefault();
        pickOption(options[highlight]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && onSubmit) {
      e.preventDefault();
      onSubmit({ text: value, entityRefs: refs });
    }
  }

  const menu =
    mounted && open && menuStyle
      ? createPortal(
          <div
            ref={menuRef}
            id={listId}
            role="listbox"
            style={menuStyle}
            className="flex flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-900"
          >
            <div className="flex shrink-0 flex-wrap gap-1 border-b border-slate-100 px-2 py-1.5 dark:border-slate-700">
              {ENTITY_MENTION_TYPES.map((tab) => (
                <button
                  key={tab.type}
                  type="button"
                  className={`rounded-md px-2 py-1 text-xs font-medium ${
                    entityType === tab.type
                      ? "bg-indigo-600 text-white"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200"
                  }`}
                  onMouseDown={(ev) => {
                    ev.preventDefault();
                    setEntityType(tab.type);
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <ul className="min-h-0 flex-1 overflow-y-auto py-1">
              {loading ? (
                <li className="px-3 py-2 text-sm text-slate-500">Searching…</li>
              ) : searchError ? (
                <li className="px-3 py-2 text-sm text-red-600">{searchError}</li>
              ) : options.length === 0 ? (
                <li className="px-3 py-2 text-sm text-slate-500">No matches — try another name</li>
              ) : (
                options.map((opt, index) => (
                  <li key={`${opt.type}-${opt.code ?? opt.id}-${opt.label}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={index === highlight}
                      className={`flex w-full flex-col items-start px-3 py-2 text-left text-sm ${
                        index === highlight
                          ? "bg-indigo-50 text-indigo-950 dark:bg-indigo-950/40 dark:text-indigo-100"
                          : "text-slate-800 hover:bg-slate-50 dark:text-slate-100 dark:hover:bg-slate-800"
                      }`}
                      onMouseDown={(ev) => {
                        ev.preventDefault();
                        pickOption(opt);
                      }}
                      onMouseEnter={() => setHighlight(index)}
                    >
                      <span className="font-medium">{opt.label}</span>
                      {opt.meta ? <span className="text-xs text-slate-500">{opt.meta}</span> : null}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={`relative ${className}`}>
      <textarea
        ref={textareaRef}
        rows={rows}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        className={textareaClassName}
        aria-autocomplete="list"
        aria-controls={open ? listId : undefined}
        aria-expanded={open}
        onChange={handleChange}
        onClick={handleSelect}
        onKeyUp={handleSelect}
        onKeyDown={handleKeyDown}
        onBlur={(e) => {
          const next = e.relatedTarget;
          if (next && menuRef.current?.contains(next)) return;
          window.setTimeout(() => closeMenu(), 180);
        }}
      />
      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}
      {menu}
    </div>
  );
}
