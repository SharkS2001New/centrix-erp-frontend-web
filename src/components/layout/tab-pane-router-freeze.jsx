"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import {
  PathParamsContext,
  PathnameContext,
  ReadonlyURLSearchParams,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { normalizeTabHref } from "@/lib/tab-workspace";

function pathOnly(href) {
  const normalized = normalizeTabHref(href || "/");
  const q = normalized.indexOf("?");
  return q === -1 ? normalized : normalized.slice(0, q);
}

function parseHref(href) {
  try {
    const url = new URL(href || "/", "http://local.invalid");
    const pathname = pathOnly(url.pathname);
    return {
      pathname,
      searchParams: new ReadonlyURLSearchParams(url.searchParams),
    };
  } catch {
    return {
      pathname: "/",
      searchParams: new ReadonlyURLSearchParams(),
    };
  }
}

/**
 * Pin Next.js router hooks (usePathname / useSearchParams / useParams) to this
 * tab's href so hidden keep-alive panes do not refetch when another tab navigates.
 */
export function TabPaneRouterFreeze({ href, children }) {
  const livePathname = useContext(PathnameContext);
  const liveParams = useContext(PathParamsContext);
  const [frozenParams, setFrozenParams] = useState(null);

  const { pathname, searchParams } = useMemo(() => parseHref(href), [href]);
  const routeMatches =
    livePathname != null && pathOnly(livePathname) === pathname;

  // Capture dynamic params while this pane owns the live route; keep them after leave.
  useEffect(() => {
    if (routeMatches) {
      setFrozenParams(liveParams);
    }
  }, [routeMatches, liveParams]);

  const params = routeMatches ? liveParams : (frozenParams ?? liveParams);

  return (
    <PathnameContext.Provider value={pathname}>
      <SearchParamsContext.Provider value={searchParams}>
        <PathParamsContext.Provider value={params}>{children}</PathParamsContext.Provider>
      </SearchParamsContext.Provider>
    </PathnameContext.Provider>
  );
}
