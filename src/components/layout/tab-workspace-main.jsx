"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { TabPaneActivityProvider } from "@/contexts/tab-pane-activity-context";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { isTabWorkspaceRoute, normalizeTabHref } from "@/lib/tab-workspace";

/**
 * Keep every open workspace tab mounted so loaded lists/forms stay in memory.
 * Returning to a tab reuses the cached React tree — never swap in fresh Next.js
 * `children` on revisit (that remounts the page and refetches). Closing a tab
 * drops its cache; browser refresh remounts everything.
 */
export function TabWorkspaceMain({ children }) {
  const pathname = usePathname();
  const { enabled, tabs, activeHref: workspaceActiveHref, workspaceId } = useTabWorkspace();
  const paneCacheRef = useRef(new Map());
  const [, setCacheVersion] = useState(0);

  const routeHref = normalizeTabHref(pathname);
  const activeHref = normalizeTabHref(workspaceActiveHref || routeHref);

  const mountedHrefs = useMemo(() => {
    const hrefs = [];
    const seen = new Set();
    for (const tab of tabs) {
      const href = normalizeTabHref(tab.href);
      if (!href || seen.has(href)) continue;
      seen.add(href);
      hrefs.push(href);
    }
    if (activeHref && !seen.has(activeHref)) {
      hrefs.unshift(activeHref);
    }
    return hrefs;
  }, [activeHref, tabs]);

  useEffect(() => {
    paneCacheRef.current = new Map();
    setCacheVersion((version) => version + 1);
  }, [workspaceId]);

  // Seed / refresh only the *active* route the first time it opens.
  // Never overwrite an existing pane — that would remount and refetch.
  useLayoutEffect(() => {
    if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) return;

    const href = normalizeTabHref(pathname);
    if (paneCacheRef.current.has(href)) return;

    paneCacheRef.current.set(href, children);
    setCacheVersion((version) => version + 1);
  }, [children, enabled, pathname]);

  // Drop panes for closed tabs.
  useLayoutEffect(() => {
    if (!enabled) return;

    const allowed = new Set(mountedHrefs);
    let changed = false;
    for (const href of [...paneCacheRef.current.keys()]) {
      if (!allowed.has(href)) {
        paneCacheRef.current.delete(href);
        changed = true;
      }
    }
    if (changed) setCacheVersion((version) => version + 1);
  }, [enabled, mountedHrefs]);

  if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) {
    return children;
  }

  return (
    <>
      {mountedHrefs.map((href) => {
        const isActive = href === activeHref;
        const pane = paneCacheRef.current.get(href) ?? (isActive ? children : null);
        if (!pane) return null;

        return (
          <TabPaneActivityProvider key={href} paneHref={href} isActive={isActive}>
            <div
              className={isActive ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}
              aria-hidden={!isActive}
              data-tab-workspace-pane={href}
              data-tab-suspended={!isActive || undefined}
            >
              {pane}
            </div>
          </TabPaneActivityProvider>
        );
      })}
    </>
  );
}
