"use client";

import { useLayoutEffect, useMemo, useState } from "react";
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
  const [paneCache, setPaneCache] = useState(() => new Map());
  const [cacheWorkspaceId, setCacheWorkspaceId] = useState(workspaceId);

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

  // Reset pane cache when the workspace changes (render-safe, no ref reads).
  if (cacheWorkspaceId !== workspaceId) {
    setCacheWorkspaceId(workspaceId);
    setPaneCache(new Map());
  }

  // Seed / refresh only the *active* route the first time it opens.
  // Never overwrite an existing pane — that would remount and refetch.
  useLayoutEffect(() => {
    if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) return;

    const href = normalizeTabHref(pathname);
    setPaneCache((prev) => {
      if (prev.has(href)) return prev;
      const next = new Map(prev);
      next.set(href, children);
      return next;
    });
  }, [children, enabled, pathname]);

  // Drop panes for closed tabs.
  useLayoutEffect(() => {
    if (!enabled) return;

    const allowed = new Set(mountedHrefs);
    setPaneCache((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const href of [...next.keys()]) {
        if (!allowed.has(href)) {
          next.delete(href);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [enabled, mountedHrefs]);

  if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) {
    return children;
  }

  return (
    <>
      {mountedHrefs.map((href) => {
        const isActive = href === activeHref;
        const pane = paneCache.get(href) ?? (isActive ? children : null);
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
