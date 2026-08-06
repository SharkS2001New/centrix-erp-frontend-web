"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Derive list refresh UI flags so search/filter refetches keep the table mounted
 * (opacity) instead of swapping to a full-page spinner.
 */
export function resolveListRefreshUi({
  loading = false,
  listLoading = false,
  hasRows = false,
  hasLoadedOnce = false,
} = {}) {
  const isFetching = Boolean(loading || listLoading);
  const showInitialLoading = !hasLoadedOnce && isFetching;
  const isRefreshing = hasLoadedOnce && Boolean(listLoading) && !loading;

  return {
    showInitialLoading,
    isRefreshing,
    isFetching,
    contentClassName: isRefreshing ? "opacity-60 transition-opacity duration-150" : "",
    /** @deprecated Prefer showInitialLoading — kept for gradual migration */
    tableLoading: showInitialLoading,
  };
}

/**
 * Track first successful load so later searches use opacity instead of unmounting content.
 */
export function useListRefreshUi({ loading = false, listLoading = false, hasRows = false } = {}) {
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  useEffect(() => {
    if (hasRows && !loading && !listLoading) {
      setHasLoadedOnce(true);
    }
  }, [hasRows, loading, listLoading]);

  return useMemo(
    () => resolveListRefreshUi({ loading, listLoading, hasRows, hasLoadedOnce }),
    [loading, listLoading, hasRows, hasLoadedOnce],
  );
}

/**
 * Report screens with a single `loading` flag — same no-flicker semantics.
 */
export function useReportRefreshUi({ loading = false, hasRows = false } = {}) {
  return useListRefreshUi({ loading, listLoading: loading, hasRows });
}
