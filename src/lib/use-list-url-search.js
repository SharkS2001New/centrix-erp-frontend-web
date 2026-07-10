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
