"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { TabPaneActivityProvider } from "@/contexts/tab-pane-activity-context";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { isTabWorkspaceRoute, normalizeTabHref } from "@/lib/tab-workspace";

/**
 * Keep every open workspace tab mounted so loaded lists/forms stay in memory.
 * Returning to a tab reuses the cached React tree — it must not swap in fresh
 * Next.js `children` (that remounts the page and refetches). Closing a tab
 * drops its cache; browser refresh remounts everything.
 */
export function TabWorkspaceMain({ children }) {
  const pathname = usePathname();
  const { enabled, tabs, workspaceId } = useTabWorkspace();
  const [paneCache, setPaneCache] = useState(() => new Map());

  const activeHref = normalizeTabHref(pathname);

  const mountedHrefs = useMemo(() => {
    const hrefs = new Set([activeHref]);
    for (const tab of tabs) {
      const href = normalizeTabHref(tab.href);
      if (href) hrefs.add(href);
    }
    return hrefs;
  }, [activeHref, tabs]);

  useEffect(() => {
    setPaneCache(new Map());
  }, [workspaceId]);

  // Cache each route's tree the first time it opens — never overwrite on revisit.
  useEffect(() => {
    if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) return;
    setPaneCache((prev) => {
      const href = normalizeTabHref(pathname);
      if (prev.has(href)) return prev;
      const next = new Map(prev);
      next.set(href, children);
      return next;
    });
  }, [children, enabled, pathname]);

  // Drop panes for closed tabs; keep existing trees for still-open ones.
  useEffect(() => {
    setPaneCache((prev) => {
      let changed = false;
      const next = new Map();
      for (const href of mountedHrefs) {
        const existing = prev.get(href);
        if (existing) {
          next.set(href, existing);
        } else if (href === activeHref) {
          next.set(href, children);
          changed = true;
        }
      }
      if (next.size !== prev.size) changed = true;
      else {
        for (const href of next.keys()) {
          if (next.get(href) !== prev.get(href)) {
            changed = true;
            break;
          }
        }
      }
      return changed ? next : prev;
    });
  }, [activeHref, children, mountedHrefs]);

  if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) {
    return children;
  }

  return (
    <>
      {[...mountedHrefs].map((href) => {
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
