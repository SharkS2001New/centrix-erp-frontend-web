"use client";

import { useContext, useMemo, useRef } from "react";
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
  const frozenParamsRef = useRef(null);

  const { pathname, searchParams } = useMemo(() => parseHref(href), [href]);

  // While this pane's route is the live Next.js route, mirror dynamic params.
  // After navigating away, keep the last matching params so useParams stays stable.
  if (livePathname != null && pathOnly(livePathname) === pathname) {
    frozenParamsRef.current = liveParams;
  }

  const params = frozenParamsRef.current ?? liveParams;

  return (
    <PathnameContext.Provider value={pathname}>
      <SearchParamsContext.Provider value={searchParams}>
        <PathParamsContext.Provider value={params}>{children}</PathParamsContext.Provider>
      </SearchParamsContext.Provider>
    </PathnameContext.Provider>
  );
}
