"use client";

import { useCallback, useEffect, useState } from "react";

export const LIST_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const LIST_PAGE_SIZE_STORAGE_KEY = "centrix-erp-list-page-size";

function readStoredPageSize(defaultSize) {
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

/** Rows-per-page preference. Pass `{ persist: false }` to keep session-only (resets to default on reload). */
export function useListPageSize(defaultSize = 10, { persist = true } = {}) {
  const [pageSize, setPageSizeState] = useState(defaultSize);

  useEffect(() => {
    if (!persist) {
      setPageSizeState(defaultSize);
      return;
    }
    setPageSizeState(readStoredPageSize(defaultSize));
  }, [defaultSize, persist]);

  const setPageSize = useCallback(
    (size) => {
      const n = Number(size);
      if (!LIST_PAGE_SIZE_OPTIONS.includes(n)) return;
      setPageSizeState(n);
      if (!persist) return;
      try {
        localStorage.setItem(LIST_PAGE_SIZE_STORAGE_KEY, String(n));
      } catch {
        /* ignore */
      }
    },
    [persist],
  );

  return { pageSize, setPageSize };
}

/**
 * Column sort state for server-paginated tables.
 * Cycles: unsorted → asc → desc → unsorted.
 *
 * @param {string | null | undefined} storageKey
 */
export function useTableSort(storageKey) {
  const [sort, setSort] = useState(null);
  const [sortDir, setSortDir] = useState("asc");

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
      let nextSort = column;
      let nextDir = "asc";
      if (sort === column) {
        if (sortDir === "asc") {
          nextDir = "desc";
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
    [sort, sortDir, persist],
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
