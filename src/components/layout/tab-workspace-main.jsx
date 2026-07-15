"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { TabPaneActivityProvider } from "@/contexts/tab-pane-activity-context";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { isTabWorkspaceRoute, normalizeTabHref } from "@/lib/tab-workspace";
import { pathBelongsToWorkspace } from "@/lib/workspaces";

/**
 * Keep every open workspace tab fully mounted (in memory).
 * Soft-unmounting inactive tabs was dropping form state when switching away
 * and back. Cap is TAB_WORKSPACE_MAX_TABS, so memory stays bounded.
 * Closing a tab drops its cache; a full browser refresh remounts panes
 * (tab chrome is restored from localStorage).
 */
export function TabWorkspaceMain({ children }) {
  const pathname = usePathname();
  const { enabled, tabs, activeHref: workspaceActiveHref, workspaceId } = useTabWorkspace();
  const [paneCache, setPaneCache] = useState(() => new Map());
  const [cacheWorkspaceId, setCacheWorkspaceId] = useState(workspaceId);

  const activeHref = normalizeTabHref(workspaceActiveHref || pathname);

  const mountedHrefs = useMemo(() => {
    const hrefs = [];
    const seen = new Set();
    for (const tab of tabs) {
      const href = normalizeTabHref(tab.href);
      if (!href || seen.has(href)) continue;
      if (workspaceId && !pathBelongsToWorkspace(href, workspaceId)) continue;
      seen.add(href);
      hrefs.push(href);
    }
    if (
      activeHref &&
      !seen.has(activeHref) &&
      (!workspaceId || pathBelongsToWorkspace(activeHref, workspaceId))
    ) {
      hrefs.unshift(activeHref);
    }
    return hrefs;
  }, [activeHref, tabs, workspaceId]);

  /** Always keep all open tabs live so in-progress work survives tab switches. */
  const liveHrefs = useMemo(() => {
    const live = new Set(mountedHrefs);
    // Dirty tabs stay pinned (covers any future soft-unmount policy changes).
    for (const tab of tabs) {
      if (!tab?.dirty) continue;
      const href = normalizeTabHref(tab.href);
      if (href) live.add(href);
    }
    return live;
  }, [mountedHrefs, tabs]);

  // Reset pane cache when the workspace changes (render-safe, no ref reads).
  if (cacheWorkspaceId !== workspaceId) {
    setCacheWorkspaceId(workspaceId);
    setPaneCache(new Map());
  }

  // Seed / refresh only the *active* route the first time it opens (or after soft-unmount).
  // Never overwrite an existing hot pane — that would remount and refetch.
  useLayoutEffect(() => {
    if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) return;
    if (!workspaceId || !pathBelongsToWorkspace(pathname, workspaceId)) return;

    const href = normalizeTabHref(pathname);
    setPaneCache((prev) => {
      if (prev.has(href)) return prev;
      const next = new Map(prev);
      next.set(href, children);
      return next;
    });
  }, [children, enabled, pathname, workspaceId]);

  // Drop panes for closed tabs only (open tabs stay mounted for the session).
  useLayoutEffect(() => {
    if (!enabled) return;

    const allowed = new Set(mountedHrefs);
    for (const href of liveHrefs) allowed.add(href);

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
  }, [enabled, liveHrefs, mountedHrefs]);

  if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) {
    return children;
  }

  return (
    <>
      {mountedHrefs.map((href) => {
        const isActive = href === activeHref;
        if (!liveHrefs.has(href) && !isActive) return null;

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
