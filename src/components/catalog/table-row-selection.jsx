"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const TABLE_ROW_CHECKBOX_CLASS =
  "h-4 w-4 rounded border-slate-300 text-[#185FA5] focus:ring-[#185FA5]";

export function usePageRowSelection() {
  const [selectedIds, setSelectedIds] = useState(() => new Set());

  const toggleOne = useCallback((id) => {
    const key = String(id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleAllOnPage = useCallback((checked, pageIds) => {
    const keys = pageIds.map((id) => String(id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const key of keys) next.add(key);
      } else {
        for (const key of keys) next.delete(key);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  const isAllOnPageSelected = useCallback(
    (pageIds) => {
      const keys = pageIds.map((id) => String(id));
      return keys.length > 0 && keys.every((key) => selectedIds.has(key));
    },
    [selectedIds],
  );

  const isSomeOnPageSelected = useCallback(
    (pageIds) => {
      const keys = pageIds.map((id) => String(id));
      const count = keys.filter((key) => selectedIds.has(key)).length;
      return count > 0 && count < keys.length;
    },
    [selectedIds],
  );

  const hasSelection = selectedIds.size > 0;

  return {
    selectedIds,
    selectedCount: selectedIds.size,
    hasSelection,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
    setSelectedIds,
  };
}

export async function runSequentialDeletes({ ids, deleteItem }) {
  const succeeded = [];
  const failed = [];

  for (const id of ids) {
    try {
      await deleteItem(id);
      succeeded.push(id);
    } catch (e) {
      failed.push({
        id,
        message: e instanceof Error ? e.message : "Delete failed",
      });
    }
  }

  return { succeeded, failed };
}

export function TableSelectAllHeader({ checked, indeterminate = false, onChange, label }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <th className="w-10 px-3 py-3">
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className={TABLE_ROW_CHECKBOX_CLASS}
        aria-label={label ?? "Select all on this page"}
      />
    </th>
  );
}

export function TableRowSelectCell({ checked, onChange, label }) {
  return (
    <td className="w-10 px-3 py-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className={TABLE_ROW_CHECKBOX_CLASS}
        aria-label={label}
      />
    </td>
  );
}

export function BatchActionBar({ count, onClear, children }) {
  if (!count) return null;

  return (
    <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <span className="text-sm text-slate-600 dark:text-slate-300">
        {count.toLocaleString()} selected
      </span>
      {onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          Clear
        </button>
      ) : null}
      {children}
    </div>
  );
}

export function BatchDeleteButton({ count, busy, onClick }) {
  return (
    <button
      type="button"
      disabled={busy || count === 0}
      onClick={onClick}
      className="rounded-lg bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? "Deleting…" : `Delete${count > 1 ? ` (${count})` : ""}`}
    </button>
  );
}

export function TableTreeCornerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      className="shrink-0 text-slate-300"
      aria-hidden="true"
    >
      <path d="M1 1v8h8" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
