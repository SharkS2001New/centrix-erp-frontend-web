"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useDebouncedValue } from "@/lib/use-debounced-value";

/**
 * Sync a list page search box with the `?q=` URL param (used by global module search).
 */
export function useListUrlSearch({ param = "q", debounceMs = 350 } = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get(param) ?? "";
  const [search, setSearchState] = useState(urlQ);
  const debouncedSearch = useDebouncedValue(search, debounceMs);

  useEffect(() => {
    setSearchState(urlQ);
  }, [urlQ]);

  const setSearch = useCallback((value) => {
    setSearchState(value);
  }, []);

  useEffect(() => {
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
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [debouncedSearch, param, pathname, router, searchParams]);

  return {
    search,
    setSearch,
    debouncedSearch,
    urlQuery: urlQ,
  };
}
