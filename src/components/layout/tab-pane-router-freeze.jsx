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
 * PathParamsContext does not re-parse from PathnameContext — keep-alive panes must
 * supply dynamic segments from their own href or useParams() becomes undefined.
 */
export function paramsFromTabHref(href) {
  const pathname = pathOnly(href);
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
      ].includes(value)
    ) {
      continue;
    }
    params[key] = value;
  }

  return params;
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
  const hrefParams = useMemo(() => paramsFromTabHref(href), [href]);
  const routeMatches =
    livePathname != null && pathOnly(livePathname) === pathname;

  // Capture dynamic params while this pane owns the live route; keep them after leave.
  useEffect(() => {
    if (routeMatches) {
      setFrozenParams(liveParams);
    }
  }, [routeMatches, liveParams]);

  // Href is authoritative for this pane — never let live list-route params
  // wipe trip/product ids during navigation races.
  const params = {
    ...(routeMatches ? (liveParams ?? {}) : (frozenParams ?? liveParams ?? {})),
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
