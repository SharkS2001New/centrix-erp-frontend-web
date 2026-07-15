"use client";

import { useLayoutEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { TabPaneActivityProvider } from "@/contexts/tab-pane-activity-context";
import { TabPaneRouterFreeze } from "@/components/layout/tab-pane-router-freeze";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import {
  isTabWorkspaceRoute,
  markTabPaneMounted,
  normalizeTabHref,
  tabPaneKey,
  unmarkTabPaneMounted,
} from "@/lib/tab-workspace";
import { pathBelongsToWorkspace } from "@/lib/workspaces";

function isTabCachePlaceholder(node, depth = 0) {
  if (!node || typeof node !== "object" || depth > 6) return false;
  if (node.props?.["data-tab-cache-placeholder"] != null) return true;
  if (node.props?.role === "status" && node.props?.["aria-busy"]) return true;
  const kids = node.props?.children;
  if (Array.isArray(kids)) return kids.some((kid) => isTabCachePlaceholder(kid, depth + 1));
  if (kids && typeof kids === "object") return isTabCachePlaceholder(kids, depth + 1);
  return false;
}

/**
 * Original-style tab panes: keep visited pages mounted and hidden.
 *
 * Only the pane matching Next's live pathname receives `children`.
 * Switching back to an open tab flips visibility — no router remount.
 */
export function TabWorkspaceMain({ children }) {
  const pathname = usePathname();
  const { enabled, tabs, activeHref: workspaceActiveHref, workspaceId } = useTabWorkspace();
  const [paneCache, setPaneCache] = useState(() => new Map());
  const [cacheWorkspaceId, setCacheWorkspaceId] = useState(workspaceId);

  const nextKey = tabPaneKey(pathname);
  const activeHref = normalizeTabHref(workspaceActiveHref || pathname);
  const activeKey = tabPaneKey(activeHref);

  const mountedKeys = useMemo(() => {
    const keys = [];
    const seen = new Set();
    for (const tab of tabs) {
      const key = tabPaneKey(tab.href);
      if (!key || seen.has(key)) continue;
      if (workspaceId && !pathBelongsToWorkspace(key, workspaceId)) continue;
      seen.add(key);
      keys.push(key);
    }
    for (const key of [activeKey, nextKey]) {
      if (!key || seen.has(key)) continue;
      if (workspaceId && !pathBelongsToWorkspace(key, workspaceId)) continue;
      seen.add(key);
      keys.push(key);
    }
    return keys;
  }, [activeKey, nextKey, tabs, workspaceId]);

  if (cacheWorkspaceId !== workspaceId) {
    setCacheWorkspaceId(workspaceId);
    setPaneCache(new Map());
  }

  // Continuously refresh the LIVE route's snapshot only — never other tabs.
  useLayoutEffect(() => {
    if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) return;
    if (isTabCachePlaceholder(children)) return;

    markTabPaneMounted(nextKey);
    setPaneCache((prev) => {
      if (prev.get(nextKey) === children) return prev;
      const next = new Map(prev);
      next.set(nextKey, children);
      return next;
    });
  }, [children, enabled, nextKey, pathname]);

  // Drop closed tabs from cache.
  useLayoutEffect(() => {
    if (!enabled) return;
    const allowed = new Set(mountedKeys);
    setPaneCache((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const key of [...next.keys()]) {
        if (!allowed.has(key)) {
          next.delete(key);
          unmarkTabPaneMounted(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [enabled, mountedKeys]);

  if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) {
    return children;
  }

  return (
    <>
      {mountedKeys.map((key) => {
        const isActive = key === activeKey;
        const isLive = key === nextKey;
        const cached = paneCache.get(key);

        // Live Next children only in the Next pathname pane.
        // Other panes show their last snapshot — never adopt a foreign tree.
        const pane = isLive
          ? !isTabCachePlaceholder(children)
            ? children
            : cached
          : cached && !isTabCachePlaceholder(cached)
            ? cached
            : null;

        if (!pane) return null;

        return (
          <TabPaneActivityProvider key={key} paneHref={key} isActive={isActive}>
            <div
              className={isActive ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}
              aria-hidden={!isActive}
              hidden={!isActive}
              data-tab-workspace-pane={key}
              data-tab-suspended={!isActive || undefined}
            >
              <TabPaneRouterFreeze href={key}>{pane}</TabPaneRouterFreeze>
            </div>
          </TabPaneActivityProvider>
        );
      })}
    </>
  );
}
