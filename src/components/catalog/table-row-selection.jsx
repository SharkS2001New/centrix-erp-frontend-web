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

export const BATCH_DELETE_CHUNK_SIZE = 20;

function chunkIds(ids, size) {
  const chunks = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/** Delete ids in waves (default 20 at a time) to avoid overwhelming the API. */
export async function runSequentialDeletes({
  ids,
  deleteItem,
  batchSize = BATCH_DELETE_CHUNK_SIZE,
}) {
  const succeeded = [];
  const failed = [];
  const chunkSize = Math.max(1, Number(batchSize) || BATCH_DELETE_CHUNK_SIZE);

  for (const batch of chunkIds(ids, chunkSize)) {
    const results = await Promise.all(
      batch.map(async (id) => {
        try {
          await deleteItem(id);
          return { id, ok: true };
        } catch (e) {
          return {
            id,
            ok: false,
            message: e instanceof Error ? e.message : "Delete failed",
          };
        }
      }),
    );

    for (const result of results) {
      if (result.ok) {
        succeeded.push(result.id);
      } else {
        failed.push({ id: result.id, message: result.message });
      }
    }
  }

  return { succeeded, failed };
}

/**
 * Confirm once, delete each selected id, notify summary, clear selection, reload.
 */
export async function batchDeleteWithConfirm({
  confirm,
  selectedIds,
  entityName,
  deleteItem,
  clearSelection,
  reload,
  notifySuccess,
  notifyError,
  labelForId,
}) {
  const ids = [...selectedIds];
  if (ids.length === 0) return;

  const ok = await confirm({
    title: `Delete selected ${entityName}`,
    message: `Delete ${ids.length} ${entityName}${ids.length === 1 ? "" : "s"}? This cannot be undone.`,
    confirmLabel: "Delete",
    destructive: true,
  });
  if (!ok) return;

  const { succeeded, failed } = await runSequentialDeletes({ ids, deleteItem });
  clearSelection();
  await reload();

  if (failed.length === 0) {
    notifySuccess(`Deleted ${succeeded.length} ${entityName}${succeeded.length === 1 ? "" : "s"}`);
    return;
  }
  if (succeeded.length === 0) {
    notifyError(failed[0]?.message ?? "Delete failed");
    return;
  }
  const names = failed
    .slice(0, 3)
    .map((f) => labelForId?.(f.id) ?? f.id)
    .join(", ");
  notifyError(`Deleted ${succeeded.length}; ${failed.length} failed${names ? ` (${names})` : ""}`);
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
