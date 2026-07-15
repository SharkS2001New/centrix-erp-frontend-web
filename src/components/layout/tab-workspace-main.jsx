"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { TabPaneActivityProvider } from "@/contexts/tab-pane-activity-context";
import { TabPaneRouterFreeze } from "@/components/layout/tab-pane-router-freeze";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { isTabWorkspaceRoute, normalizeTabHref } from "@/lib/tab-workspace";
import { pathBelongsToWorkspace } from "@/lib/workspaces";

/** True when children is (or wraps) the route loading skeleton — never keep that as a pane. */
function isTabCachePlaceholder(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return false;
  if (node.props?.["data-tab-cache-placeholder"] != null) return true;
  if (node.props?.role === "status" && node.props?.["aria-busy"]) return true;

  const kids = node.props?.children;
  if (Array.isArray(kids)) {
    return kids.some((kid) => isTabCachePlaceholder(kid, depth + 1));
  }
  if (kids && typeof kids === "object") {
    return isTabCachePlaceholder(kids, depth + 1);
  }
  return false;
}

/**
 * Keep every open workspace tab fully mounted (in memory).
 *
 * Next App Router only supplies one live `children` tree. That tree always
 * stays mounted under the Next pathname pane. When navigating away, we freeze
 * the last live tree into a pane cache so switching back is a visibility
 * toggle — not a remount / refetch.
 */
export function TabWorkspaceMain({ children }) {
  const pathname = usePathname();
  const { enabled, tabs, activeHref: workspaceActiveHref, workspaceId } = useTabWorkspace();
  const [paneCache, setPaneCache] = useState(() => new Map());
  const [cacheWorkspaceId, setCacheWorkspaceId] = useState(workspaceId);
  const liveByHrefRef = useRef(new Map());
  const prevNextHrefRef = useRef(null);

  const nextHref = normalizeTabHref(pathname);
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
    if (
      nextHref &&
      !seen.has(nextHref) &&
      (!workspaceId || pathBelongsToWorkspace(nextHref, workspaceId))
    ) {
      hrefs.push(nextHref);
    }
    return hrefs;
  }, [activeHref, nextHref, tabs, workspaceId]);

  const liveHrefs = useMemo(() => {
    const live = new Set(mountedHrefs);
    for (const tab of tabs) {
      if (!tab?.dirty) continue;
      const href = normalizeTabHref(tab.href);
      if (href) live.add(href);
    }
    return live;
  }, [mountedHrefs, tabs]);

  // Reset pane cache when the workspace changes (render-safe).
  if (cacheWorkspaceId !== workspaceId) {
    setCacheWorkspaceId(workspaceId);
    setPaneCache(new Map());
  }

  useLayoutEffect(() => {
    liveByHrefRef.current = new Map();
    prevNextHrefRef.current = null;
  }, [workspaceId]);

  useLayoutEffect(() => {
    if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) return;
    if (!workspaceId || !pathBelongsToWorkspace(pathname, workspaceId)) return;

    const previousHref = prevNextHrefRef.current;

    if (!isTabCachePlaceholder(children)) {
      liveByHrefRef.current.set(nextHref, children);
    }

    // Freeze the previous Next route so it can stay mounted after soft-nav.
    if (previousHref && previousHref !== nextHref) {
      const snap = liveByHrefRef.current.get(previousHref);
      if (snap && !isTabCachePlaceholder(snap)) {
        setPaneCache((prev) => {
          if (prev.get(previousHref) === snap) return prev;
          const next = new Map(prev);
          next.set(previousHref, snap);
          return next;
        });
      }
    }
    prevNextHrefRef.current = nextHref;

    // Seed / upgrade placeholder for the live Next route only.
    if (isTabCachePlaceholder(children)) return;
    setPaneCache((prev) => {
      const existing = prev.get(nextHref);
      if (existing && !isTabCachePlaceholder(existing)) return prev;
      if (existing === children) return prev;
      const next = new Map(prev);
      next.set(nextHref, children);
      return next;
    });
  }, [children, enabled, nextHref, pathname, workspaceId]);

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
          liveByHrefRef.current.delete(href);
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

        const isNextRoute = href === nextHref;
        const cached = paneCache.get(href);

        // Next's live tree stays under the Next pathname pane. Other tabs use
        // the frozen snapshot from when that route was last the live one.
        let pane = null;
        if (isNextRoute) {
          pane = children;
        } else if (cached && !isTabCachePlaceholder(cached)) {
          pane = cached;
        }

        if (!pane) return null;

        return (
          <TabPaneActivityProvider key={href} paneHref={href} isActive={isActive}>
            <div
              className={isActive ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}
              aria-hidden={!isActive}
              data-tab-workspace-pane={href}
              data-tab-suspended={!isActive || undefined}
            >
              <TabPaneRouterFreeze href={href}>{pane}</TabPaneRouterFreeze>
            </div>
          </TabPaneActivityProvider>
        );
      })}
    </>
  );
}
