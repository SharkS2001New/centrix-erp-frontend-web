"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { TabPaneActivityProvider } from "@/contexts/tab-pane-activity-context";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { isTabWorkspaceRoute, normalizeTabHref } from "@/lib/tab-workspace";

/**
 * Active tab is always mounted. Inactive tabs are unmounted unless they have unsaved
 * form data (dirty) — those stay mounted but suspended (no API refresh, in-flight
 * requests aborted).
 */
export function TabWorkspaceMain({ children }) {
  const pathname = usePathname();
  const { enabled, tabs, workspaceId } = useTabWorkspace();
  const [paneCache, setPaneCache] = useState(() => new Map());

  const activeHref = normalizeTabHref(pathname);

  const dirtyHrefs = useMemo(
    () => new Set(tabs.filter((tab) => tab.dirty).map((tab) => tab.href)),
    [tabs],
  );

  const mountedHrefs = useMemo(() => {
    const hrefs = new Set([activeHref]);
    for (const href of dirtyHrefs) hrefs.add(href);
    return hrefs;
  }, [activeHref, dirtyHrefs]);

  useEffect(() => {
    setPaneCache(new Map());
  }, [workspaceId]);

  useEffect(() => {
    if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) return;
    setPaneCache((prev) => {
      const href = normalizeTabHref(pathname);
      if (prev.get(href) === children) return prev;
      const next = new Map(prev);
      next.set(href, children);
      return next;
    });
  }, [children, enabled, pathname]);

  useEffect(() => {
    setPaneCache((prev) => {
      let changed = false;
      const next = new Map();
      for (const href of mountedHrefs) {
        const pane = href === activeHref ? children : prev.get(href);
        if (pane) next.set(href, pane);
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
        const pane = isActive ? children : paneCache.get(href);
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
