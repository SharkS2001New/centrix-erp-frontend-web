"use client";

import { useCallback, useEffect, useState } from "react";

export const LIST_PAGE_SIZE_OPTIONS = [10, 20, 25, 50, 100];
export const LIST_PAGE_SIZE_STORAGE_KEY = "centrix-erp-list-page-size";

function pageSizeOptionsFor(maxSize) {
  return maxSize == null
    ? LIST_PAGE_SIZE_OPTIONS
    : LIST_PAGE_SIZE_OPTIONS.filter((n) => n <= maxSize);
}

export function readStoredPageSize(defaultSize) {
  if (typeof window === "undefined") return defaultSize;
  try {
    const raw = localStorage.getItem(LIST_PAGE_SIZE_STORAGE_KEY);
    const n = Number(raw);
    if (LIST_PAGE_SIZE_OPTIONS.includes(n)) return n;
  } catch {
    /* ignore */
  }
  return defaultSize;
}

/**
 * Resolve rows-per-page synchronously (SSR-safe default; client reads localStorage).
 * Use before first fetch/paint so lists do not flash default → stored size.
 */
export function resolveListPageSize(defaultSize = 10, { persist = true, maxSize = null } = {}) {
  const pageSizeOptions = pageSizeOptionsFor(maxSize);
  const clampedDefault = pageSizeOptions.includes(defaultSize)
    ? defaultSize
    : (pageSizeOptions[pageSizeOptions.length - 1] ?? defaultSize);
  if (!persist) {
    return { pageSize: clampedDefault, pageSizeOptions, clampedDefault };
  }
  const stored = readStoredPageSize(clampedDefault);
  if (pageSizeOptions.includes(stored)) {
    return { pageSize: stored, pageSizeOptions, clampedDefault };
  }
  // Preference exceeds this screen's maxSize — use the largest allowed option
  // instead of snapping back to the screen default (avoids 100 → 20 flash).
  if (maxSize != null && stored > maxSize) {
    const capped = pageSizeOptions[pageSizeOptions.length - 1] ?? clampedDefault;
    return { pageSize: capped, pageSizeOptions, clampedDefault };
  }
  return { pageSize: clampedDefault, pageSizeOptions, clampedDefault };
}

function readStoredSort(storageKey) {
  if (!storageKey || typeof window === "undefined") return { sort: null, sortDir: "asc" };
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return { sort: null, sortDir: "asc" };
    const parsed = JSON.parse(raw);
    const sort = typeof parsed?.sort === "string" && parsed.sort ? parsed.sort : null;
    const sortDir = parsed?.sortDir === "desc" ? "desc" : "asc";
    return { sort, sortDir };
  } catch {
    return { sort: null, sortDir: "asc" };
  }
}

/**
 * Rows-per-page preference.
 * Pass `{ persist: false }` to keep session-only (resets to default on reload).
 * Pass `{ maxSize: 50 }` to cap options (e.g. heavy reports shouldn't inherit global 100).
 *
 * Stored preference is applied on the first render (lazy useState) so the first
 * network request and first paint already use the correct page size.
 */
export function useListPageSize(defaultSize = 10, { persist = true, maxSize = null } = {}) {
  const pageSizeOptions = pageSizeOptionsFor(maxSize);
  const clampedDefault = pageSizeOptions.includes(defaultSize)
    ? defaultSize
    : (pageSizeOptions[pageSizeOptions.length - 1] ?? defaultSize);

  const [pageSize, setPageSizeState] = useState(() => {
    if (!persist) return clampedDefault;
    return resolveListPageSize(defaultSize, { persist, maxSize }).pageSize;
  });

  // Re-clamp when maxSize / default changes — do not re-read storage after mount
  // (that was causing paint-with-default then jump-to-stored).
  useEffect(() => {
    const options = pageSizeOptionsFor(maxSize);
    setPageSizeState((current) => {
      if (!persist) return clampedDefault;
      if (options.includes(current)) return current;
      if (maxSize != null && current > maxSize) {
        return options[options.length - 1] ?? clampedDefault;
      }
      return clampedDefault;
    });
  }, [clampedDefault, persist, maxSize]);

  const setPageSize = useCallback(
    (size) => {
      const options = pageSizeOptionsFor(maxSize);
      const n = Number(size);
      if (!options.includes(n)) return;
      setPageSizeState(n);
      if (!persist) return;
      try {
        localStorage.setItem(LIST_PAGE_SIZE_STORAGE_KEY, String(n));
      } catch {
        /* ignore */
      }
    },
    [persist, maxSize],
  );

  // Always ready: size is resolved synchronously on first render (no deferred hydrate).
  return { pageSize, setPageSize, pageSizeOptions, pageSizeReady: true };
}

const EMPTY_FIRST_DIR = Object.freeze({});

/**
 * Column sort state for server-paginated tables.
 * Default cycle: unsorted → asc → desc → unsorted.
 * Pass `firstDirByColumn` to prefer desc-first for date/id columns.
 *
 * @param {string | null | undefined} storageKey
 * @param {{ firstDirByColumn?: Record<string, "asc" | "desc"> }} [options]
 */
export function useTableSort(storageKey, options = {}) {
  const firstDirByColumn = options.firstDirByColumn ?? EMPTY_FIRST_DIR;
  // Sync hydrate (like page size) — avoids default-sort fetch then stored-sort refetch.
  const [sort, setSort] = useState(() => readStoredSort(storageKey).sort);
  const [sortDir, setSortDir] = useState(() => readStoredSort(storageKey).sortDir);

  useEffect(() => {
    const stored = readStoredSort(storageKey);
    setSort(stored.sort);
    setSortDir(stored.sortDir);
  }, [storageKey]);

  const persist = useCallback(
    (nextSort, nextDir) => {
      if (!storageKey) return;
      try {
        if (!nextSort) {
          localStorage.removeItem(storageKey);
          return;
        }
        localStorage.setItem(storageKey, JSON.stringify({ sort: nextSort, sortDir: nextDir }));
      } catch {
        /* ignore */
      }
    },
    [storageKey],
  );

  const toggleSort = useCallback(
    (column) => {
      if (!column) return { sort: null, sortDir: "asc" };
      const firstDir = firstDirByColumn[column] === "desc" ? "desc" : "asc";
      const secondDir = firstDir === "desc" ? "asc" : "desc";
      let nextSort = column;
      let nextDir = firstDir;
      if (sort === column) {
        if (sortDir === firstDir) {
          nextDir = secondDir;
        } else {
          nextSort = null;
          nextDir = "asc";
        }
      }
      setSort(nextSort);
      setSortDir(nextDir);
      persist(nextSort, nextDir);
      return { sort: nextSort, sortDir: nextDir };
    },
    [sort, sortDir, persist, firstDirByColumn],
  );

  const clearSort = useCallback(() => {
    setSort(null);
    setSortDir("asc");
    persist(null, "asc");
  }, [persist]);

  return {
    sort,
    sortDir,
    sortActive: Boolean(sort),
    toggleSort,
    clearSort,
  };
}

/** @param {string | null | undefined} sort @param {"asc" | "desc"} sortDir */
export function listSortSearchParams(sort, sortDir) {
  if (!sort) return {};
  return { sort, sort_dir: sortDir === "desc" ? "desc" : "asc" };
}
