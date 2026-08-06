"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTabPaneActive } from "@/contexts/tab-pane-activity-context";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { normalizeTabHref } from "@/lib/tab-workspace";

function pathOnly(href) {
  const normalized = normalizeTabHref(href || "/");
  const q = normalized.indexOf("?");
  return q === -1 ? normalized : normalized.slice(0, q);
}

/**
 * Sync a list page search box with the `?q=` URL param (used by global module search).
 * When the tab pane is suspended (hidden keep-alive), ignore global URL changes and
 * never call router.replace — otherwise hidden tabs fight over the URL and refetch.
 */
export function useListUrlSearch({ param = "q", debounceMs = 350 } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isActive, paneHref } = useTabPaneActive();
  const urlQ = searchParams.get(param) ?? "";
  const [search, setSearchState] = useState(urlQ);
  const debouncedSearch = useDebouncedValue(search, debounceMs);

  const routeMatchesPane =
    !paneHref || pathOnly(pathname) === pathOnly(paneHref);
  const canSyncUrl = isActive && routeMatchesPane;

  useEffect(() => {
    if (!canSyncUrl) return;
    setSearchState(urlQ);
  }, [urlQ, canSyncUrl]);

  const setSearch = useCallback((value) => {
    setSearchState(value);
  }, []);

  useEffect(() => {
    if (!canSyncUrl) return;

    const trimmed = debouncedSearch.trim();
    const current = (searchParams.get(param) ?? "").trim();
    if (trimmed === current) {
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    if (trimmed) {
      params.set(param, trimmed);
    } else {
      params.delete(param);
    }
    params.delete("page");

    const qs = params.toString();
    const basePath = pathOnly(paneHref || pathname);
    router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false });
  }, [canSyncUrl, debouncedSearch, param, paneHref, pathname, router, searchParams]);

  return {
    search,
    setSearch,
    debouncedSearch,
    urlQuery: urlQ,
  };
}

/**
 * When filters/search change, fetch page 1 immediately even if React page state
 * has not caught up yet (avoids a stale-page flash after router.replace drops ?page).
 *
 * Pass `pause: true` while restoring persisted list state so a delayed search
 * debounce does not wipe the restored page number.
 */
export function useListQueryPage(page, setPage, filterKey, { pause = false } = {}) {
  const [appliedFilterKey, setAppliedFilterKey] = useState(filterKey);
  const [wasPaused, setWasPaused] = useState(pause);

  if (pause !== wasPaused) {
    setWasPaused(pause);
    if (!pause) {
      // Leaving restore — adopt the current filter key without resetting page.
      setAppliedFilterKey(filterKey);
    }
  } else if (!pause && filterKey !== appliedFilterKey) {
    setAppliedFilterKey(filterKey);
    if (page !== 1) setPage(1);
  }

  if (pause) return page;
  return filterKey !== appliedFilterKey ? 1 : page;
}
