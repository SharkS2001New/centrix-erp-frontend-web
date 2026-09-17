"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Derive list refresh UI flags so search/filter refetches keep the table mounted
 * (opacity) instead of swapping to a full-page spinner.
 *
 * First paint is gated on the **list** request only — parallel refs/dashboard/summary
 * (`loading`) must not block the table.
 */
export function resolveListRefreshUi({
  loading = false,
  listLoading = false,
  hasRows = false,
  hasLoadedOnce = false,
} = {}) {
  const isFetching = Boolean(loading || listLoading);
  const showInitialLoading = !hasLoadedOnce && Boolean(listLoading);
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
 * Track first successful list load so later searches use opacity instead of unmounting content.
 * Does not wait for parallel reference/`loading` work.
 */
export function useListRefreshUi({ loading = false, listLoading = false, hasRows = false } = {}) {
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const listFetchStarted = useRef(false);

  useEffect(() => {
    if (listLoading) {
      listFetchStarted.current = true;
    }
  }, [listLoading]);

  useEffect(() => {
    if (hasRows) {
      setHasLoadedOnce(true);
      return;
    }
    // Empty list still counts once the first list request has finished.
    if (listFetchStarted.current && !listLoading) {
      setHasLoadedOnce(true);
    }
  }, [hasRows, listLoading]);

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
