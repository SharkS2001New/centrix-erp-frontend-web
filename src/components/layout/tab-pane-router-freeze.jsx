"use client";

import { useContext, useEffect, useMemo, useState } from "react";
import {
  PathParamsContext,
  PathnameContext,
  ReadonlyURLSearchParams,
  SearchParamsContext,
} from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { pathOnlyFromHref } from "@/lib/tab-workspace";

function parseHref(href) {
  try {
    const url = new URL(href || "/", "http://local.invalid");
    const pathname = pathOnlyFromHref(url.pathname);
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
 * PathParamsContext does not re-parse from PathnameContext — keep-alive panes must
 * supply dynamic segments from their own href or useParams() becomes undefined.
 */
export function paramsFromTabHref(href) {
  const pathname = pathOnlyFromHref(href);
  const params = {};

  const patterns = [
    [/^\/fulfillment\/trips\/([^/]+)/, "id"],
    [/^\/fulfillment\/routes\/([^/]+)/, "id"],
    [/^\/fulfillment\/drivers\/([^/]+)/, "id"],
    [/^\/fulfillment\/vehicles\/([^/]+)/, "id"],
    [/^\/inventory\/stock-take\/([^/]+)/, "id"],
    [/^\/inventory\/receipts\/([^/]+)/, "ref"],
    [/^\/lpo\/([^/]+)/, "lpoNo"],
    [/^\/products\/([^/]+)/, "code"],
    [/^\/customers\/([^/]+)/, "id"],
    [/^\/suppliers\/returns\/([^/]+)/, "id"],
    [/^\/suppliers\/([^/]+)/, "id"],
    [/^\/hr\/employees\/([^/]+)/, "id"],
    [/^\/hr\/payroll\/runs\/([^/]+)/, "id"],
    [/^\/accounting\/customer-invoices\/([^/]+)/, "id"],
    [/^\/accounting\/journal-entries\/([^/]+)/, "id"],
    [/^\/accounting\/bank-reconciliation\/([^/]+)/, "id"],
    [/^\/sales\/orders\/queues\/([^/]+)/, "slug"],
    [/^\/sales\/orders\/([^/]+)/, "id"],
    [/^\/sales\/returns\/([^/]+)/, "id"],
    [/^\/reports\/custom\/([^/]+)/, "id"],
    [/^\/reports\/([^/]+)/, "key"],
    [/^\/routes\/([^/]+)/, "id"],
    [/^\/platform\/organizations\/([^/]+)/, "id"],
  ];

  for (const [re, key] of patterns) {
    const match = pathname.match(re);
    if (!match) continue;
    const value = decodeURIComponent(match[1]);
    if (
      [
        "new",
        "edit",
        "page",
        "returns",
        "payments",
        "queues",
        "custom",
        "print",
        "receive",
        "undefined",
        "null",
      ].includes(value)
    ) {
      continue;
    }
    params[key] = value;
    break;
  }

  return params;
}

/**
 * Pin Next.js router hooks (usePathname / useSearchParams / useParams) to this
 * tab's href so hidden keep-alive panes do not refetch when another tab navigates.
 *
 * When this pane owns the live route, search params come from the live URL so
 * deep links like ?customer= / ?sale_id= still work. When suspended, the last
 * live search (or href query) is frozen.
 */
export function TabPaneRouterFreeze({ href, children }) {
  const livePathname = useContext(PathnameContext);
  const liveParams = useContext(PathParamsContext);
  const liveSearchParams = useContext(SearchParamsContext);
  const [frozenParams, setFrozenParams] = useState(null);
  const [frozenSearchParams, setFrozenSearchParams] = useState(null);

  const { pathname, searchParams: hrefSearchParams } = useMemo(() => parseHref(href), [href]);
  const hrefParams = useMemo(() => paramsFromTabHref(href), [href]);
  const routeMatches =
    livePathname != null && pathOnlyFromHref(livePathname) === pathname;

  useEffect(() => {
    if (!routeMatches) return;
    setFrozenParams(liveParams);
    setFrozenSearchParams(liveSearchParams);
  }, [routeMatches, liveParams, liveSearchParams]);

  const searchParams = routeMatches
    ? (liveSearchParams ?? hrefSearchParams)
    : (frozenSearchParams ?? hrefSearchParams);

  // Href is authoritative for this pane — never let live list-route params
  // wipe trip/product ids during navigation races.
  const params = {
    ...(routeMatches ? (liveParams ?? {}) : (frozenParams ?? {})),
    ...hrefParams,
  };

  return (
    <PathnameContext.Provider value={pathname}>
      <SearchParamsContext.Provider value={searchParams}>
        <PathParamsContext.Provider value={params}>{children}</PathParamsContext.Provider>
      </SearchParamsContext.Provider>
    </PathnameContext.Provider>
  );
}
