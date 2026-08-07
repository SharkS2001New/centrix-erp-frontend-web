"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/** Avoid importing catalog-shared (circular with FilterSelect → this module). */
const defaultInputCls =
  "theme-input theme-input-focus h-[38px] w-full min-w-[12rem] rounded-lg border px-3 py-2 text-sm outline-none";

const LIST_MAX_HEIGHT = 240;
const MENU_GAP = 4;
const MIN_PANEL_WIDTH = 224; // 14rem — room for names; trigger can be narrower in toolbars
const VIEWPORT_EDGE_PADDING = 8;

function isSelectableOption(option) {
  return Boolean(option) && !option.isHeader && !option.groupHeader;
}

/**
 * Combobox: type to search directly in the field; results open in a list below.
 * Pass `loadOptions` for server-side search; otherwise filters `options` locally.
 *
 * Closed: field shows the selected label.
 * Open: field is a fresh search box (selected label is never used as the filter,
 * so opening "All users" / any pick shows the full list until the user types).
 *
 * Keyboard: ArrowUp/ArrowDown move highlight, Enter selects and closes, Escape closes.
 * Imperative API: `openAndFocus()` focuses the input and opens the results list.
 */
export const PosSearchableSelect = forwardRef(function PosSearchableSelect(
  {
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
  },
  ref,
) {
  const listId = useId();
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const searchSeq = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  /** Search text only — never mirrors the selected label while open. */
  const [query, setQuery] = useState("");
  const [menuStyle, setMenuStyle] = useState(null);
  const [asyncOptions, setAsyncOptions] = useState([]);
  const [asyncLoading, setAsyncLoading] = useState(false);
  const [asyncError, setAsyncError] = useState(null);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  const asyncSearch = typeof loadOptions === "function";

  const setInputNodeRef = useCallback(
    (node) => {
      inputRef.current = node;
      if (typeof triggerRef === "function") {
        triggerRef(node);
      } else if (triggerRef) {
        triggerRef.current = node;
      }
    },
    [triggerRef],
  );

  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value],
  );

  const filtered = useMemo(() => {
    if (asyncSearch) return asyncOptions;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    // Keep group headers that precede matching options so categories stay visible while searching.
    const result = [];
    let pendingHeader = null;
    for (const o of options) {
      if (o.isHeader || o.groupHeader) {
        pendingHeader = o;
        continue;
      }
      const text = (o.searchText ?? o.label).toLowerCase();
      if (text.includes(q)) {
        if (pendingHeader) {
          result.push(pendingHeader);
          pendingHeader = null;
        }
        result.push(o);
      }
    }
    return result;
  }, [asyncOptions, asyncSearch, options, query]);

  const selectableIndexes = useMemo(() => {
    const indexes = [];
    filtered.forEach((option, index) => {
      if (isSelectableOption(option)) indexes.push(index);
    });
    return indexes;
  }, [filtered]);

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
    if (open) return;
    setQuery("");
    setAsyncOptions([]);
    setAsyncLoading(false);
    setAsyncError(null);
    setHighlightIndex(-1);
  }, [open]);

  useEffect(() => {
    if (!open || !asyncSearch) return undefined;
    const t = window.setTimeout(() => {
      void runSearch(query);
    }, 280);
    return () => window.clearTimeout(t);
  }, [asyncSearch, open, query, runSearch]);

  // Keep highlight on a selectable row when results change; prefer first match.
  useEffect(() => {
    if (!open) return;
    if (selectableIndexes.length === 0) {
      setHighlightIndex(-1);
      return;
    }
    setHighlightIndex((prev) =>
      selectableIndexes.includes(prev) ? prev : selectableIndexes[0],
    );
  }, [open, selectableIndexes]);

  useEffect(() => {
    if (!open || highlightIndex < 0 || !listRef.current) return;
    const optionEl = listRef.current.querySelector(`[data-option-index="${highlightIndex}"]`);
    optionEl?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  useEffect(() => {
    if (!open || !rootRef.current) {
      setMenuStyle(null);
      return;
    }

    function updateMenuPosition() {
      const anchor = rootRef.current;
      if (!anchor) return;

      const rect = anchor.getBoundingClientRect();
      const menuWidth = Math.max(rect.width, MIN_PANEL_WIDTH);
      const maxLeft = window.innerWidth - menuWidth - VIEWPORT_EDGE_PADDING;
      let left = rect.left;
      if (left + menuWidth > window.innerWidth - VIEWPORT_EDGE_PADDING) {
        left = rect.right - menuWidth;
      }
      left = Math.max(VIEWPORT_EDGE_PADDING, Math.min(left, maxLeft));

      const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP;
      const spaceAbove = rect.top - MENU_GAP;
      const openUp =
        spaceBelow < Math.min(LIST_MAX_HEIGHT, 180) && spaceAbove > spaceBelow;
      const available = openUp ? spaceAbove : spaceBelow;
      const panelHeight = Math.max(80, Math.min(LIST_MAX_HEIGHT, available));

      setMenuStyle({
        position: "fixed",
        left,
        width: menuWidth,
        zIndex: 60,
        height: panelHeight,
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
  }, [open, filtered.length, asyncLoading, asyncError, searchError]);

  useEffect(() => {
    function onDocPointerDown(e) {
      if (rootRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocPointerDown);
    return () => document.removeEventListener("mousedown", onDocPointerDown);
  }, []);

  function pick(option) {
    if (!isSelectableOption(option)) return;
    onChange(String(option.value), option);
    setQuery("");
    setOpen(false);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function clearSelection(e) {
    e.preventDefault();
    e.stopPropagation();
    onChange("", null);
    setQuery("");
    setOpen(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function openList() {
    if (disabled || loading) return;
    setQuery("");
    setOpen(true);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function closeList() {
    setOpen(false);
    setQuery("");
  }

  function moveHighlight(direction) {
    if (selectableIndexes.length === 0) return;
    setHighlightIndex((prev) => {
      const currentPos = selectableIndexes.indexOf(prev);
      if (currentPos < 0) {
        return direction > 0 ? selectableIndexes[0] : selectableIndexes[selectableIndexes.length - 1];
      }
      const nextPos =
        (currentPos + direction + selectableIndexes.length) % selectableIndexes.length;
      return selectableIndexes[nextPos];
    });
  }

  function handleInputKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeList();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      e.stopPropagation();
      if (!open) {
        openList();
        return;
      }
      moveHighlight(1);
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      if (!open) {
        openList();
        return;
      }
      moveHighlight(-1);
      return;
    }

    if (e.key === "Enter") {
      if (open) {
        const option =
          highlightIndex >= 0 && isSelectableOption(filtered[highlightIndex])
            ? filtered[highlightIndex]
            : filtered.find(isSelectableOption);
        if (option) {
          e.preventDefault();
          e.stopPropagation();
          pick(option);
          return;
        }
      }
      onTriggerKeyDown?.(e);
      return;
    }

    onTriggerKeyDown?.(e);
  }

  useImperativeHandle(
    ref,
    () => ({
      openAndFocus() {
        openList();
      },
      focus() {
        inputRef.current?.focus();
      },
      close() {
        closeList();
      },
    }),
    [disabled, loading],
  );

  const listBusy = loading || asyncLoading;
  const listError = searchError || asyncError;
  const trimmedQuery = query.trim();
  const queryTooShort = asyncSearch && trimmedQuery.length < minSearchLength;
  const showIdleLocal =
    !asyncSearch && minSearchLength > 0 && trimmedQuery.length < minSearchLength;

  let listMessage = emptyLabel;
  if (queryTooShort || showIdleLocal) listMessage = idleSearchLabel;
  else if (listBusy) listMessage = "Searching…";
  else if (listError) listMessage = listError;

  const activeOptionId =
    highlightIndex >= 0 && filtered[highlightIndex]
      ? `${listId}-opt-${highlightIndex}`
      : undefined;

  const hasClear = Boolean(value) && !disabled && !loading;
  const inputPaddingClass = hasClear ? "pr-16" : "pr-9";

  // Closed → selected label. Open → live search text (starts empty).
  const inputDisplayValue = loading
    ? "Loading…"
    : open
      ? query
      : (selected?.label ?? "");

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
        className="pos-search-select-panel flex flex-col overflow-hidden rounded-lg border shadow-lg"
      >
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          className="min-h-0 flex-1 overflow-auto py-1"
        >
          {filtered.length === 0 ? (
            <li className={`px-3 py-2 text-sm ${listError ? "text-red-500" : "theme-text-muted"}`}>
              {listMessage}
            </li>
          ) : (
            filtered.map((o, index) =>
              o.isHeader || o.groupHeader ? (
                <li
                  key={`hdr-${o.label}`}
                  className="sticky top-0 z-[1] bg-[var(--theme-surface)] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--theme-text-subtle)]"
                >
                  {o.label}
                </li>
              ) : (
                <li key={o.value}>
                  <button
                    type="button"
                    id={`${listId}-opt-${index}`}
                    data-option-index={index}
                    role="option"
                    aria-selected={index === highlightIndex || String(o.value) === String(value)}
                    onMouseDown={(e) => {
                      // Keep input focus; avoid blur-close before click.
                      e.preventDefault();
                    }}
                    onMouseEnter={() => setHighlightIndex(index)}
                    onClick={() => pick(o)}
                    className={`pos-search-select-option block w-full px-3 py-2 text-left text-sm ${
                      index === highlightIndex || String(o.value) === String(value)
                        ? "pos-search-select-option-active"
                        : ""
                    }`}
                  >
                    {o.label}
                  </button>
                </li>
              ),
            )
          )}
        </ul>
      </div>
    ) : null;

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={setInputNodeRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeOptionId}
        disabled={disabled || loading}
        placeholder={loading ? "Loading…" : searchPlaceholder || placeholder}
        value={inputDisplayValue}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => {
          if (disabled || loading) return;
          if (!open) openList();
        }}
        onClick={() => {
          if (disabled || loading) return;
          if (!open) openList();
        }}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          setOpen(true);
          // Drop the prior pick as soon as the user starts typing a new search.
          if (value && next !== "") {
            onChange("", null);
          }
        }}
        onKeyDown={handleInputKeyDown}
        className={`${inputClassName} ${inputPaddingClass} text-left disabled:cursor-not-allowed disabled:opacity-60`}
      />
      {hasClear ? (
        <button
          type="button"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={clearSelection}
          className="theme-text-muted absolute right-8 top-1/2 -translate-y-1/2 hover:text-[var(--theme-text)]"
          aria-label="Clear selection"
        >
          ×
        </button>
      ) : null}
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        disabled={disabled || loading}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (open) {
            closeList();
            return;
          }
          openList();
        }}
        className="theme-text-muted absolute right-2 top-1/2 -translate-y-1/2 text-xs disabled:opacity-60"
      >
        {open ? "▲" : "▼"}
      </button>
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
});
