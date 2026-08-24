"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ENTITY_MENTION_TYPES,
  detectMentionTrigger,
  insertMentionAtTrigger,
  pruneEntityRefs,
  searchEntityMentions,
  searchEntityMentionsPrefetch,
  serializeEntityRefs,
} from "@/lib/ai/entity-mention-search";

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
  const abortRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState(null);
  const [entityType, setEntityType] = useState("product");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [searchError, setSearchError] = useState(null);

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
    if (!open || !trigger) return undefined;

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setSearchError(null);

    const run = async () => {
      try {
        const rows =
          trigger.query.trim() === "" && entityType !== "product"
            ? await searchEntityMentionsPrefetch(entityType, { signal: controller.signal })
            : await searchEntityMentions(entityType, trigger.query, { signal: controller.signal });
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

    const t = setTimeout(() => void run(), 160);
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
        onBlur={() => {
          // Allow click on option before closing.
          setTimeout(() => closeMenu(), 150);
        }}
      />
      {hint ? <p className="mt-1.5 text-xs text-slate-500">{hint}</p> : null}

      {open ? (
        <div
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-40 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-600 dark:bg-slate-900"
        >
          <div className="flex flex-wrap gap-1 border-b border-slate-100 px-2 py-1.5 dark:border-slate-700">
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
          <ul className="max-h-56 overflow-y-auto py-1">
            {loading ? (
              <li className="px-3 py-2 text-xs text-slate-500">Searching…</li>
            ) : searchError ? (
              <li className="px-3 py-2 text-xs text-red-600">{searchError}</li>
            ) : options.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-500">
                {entityType === "product" && !trigger?.query?.trim()
                  ? "Keep typing a product name…"
                  : "No matches"}
              </li>
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
        </div>
      ) : null}
    </div>
  );
}
