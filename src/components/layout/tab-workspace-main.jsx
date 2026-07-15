"use client";

import { Activity, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { TabPaneActivityProvider } from "@/contexts/tab-pane-activity-context";
import { TabPaneRouterFreeze } from "@/components/layout/tab-pane-router-freeze";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import {
  isNavigationPending,
  subscribeAppLoading,
  subscribeNavigationSeal,
} from "@/lib/app-loading";
import {
  isTabWorkspaceRoute,
  normalizeTabHref,
  tabPaneKey,
} from "@/lib/tab-workspace";
import { pathBelongsToWorkspace } from "@/lib/workspaces";

/** True when children is (or wraps) the route loading skeleton — never freeze that. */
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
 * Next App Router only supplies one live `children` tree. On each soft-nav we
 * synchronously seal the current live tree into a path-keyed map (via
 * beginNavigationIntent) so later tabs cannot overwrite earlier ones. Hidden
 * tabs render only their sealed snapshot; the live Next route renders children.
 */
export function TabWorkspaceMain({ children }) {
  const pathname = usePathname();
  const { enabled, tabs, activeHref: workspaceActiveHref, workspaceId } = useTabWorkspace();
  const [cacheWorkspaceId, setCacheWorkspaceId] = useState(workspaceId);
  const [paneEpoch, setPaneEpoch] = useState(0);
  const [sealedPanes, setSealedPanes] = useState(() => new Map());
  const [routeLeaving, setRouteLeaving] = useState(() => isNavigationPending());

  const liveRef = useRef({ key: null, node: null });

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
    if (
      activeKey &&
      !seen.has(activeKey) &&
      (!workspaceId || pathBelongsToWorkspace(activeKey, workspaceId))
    ) {
      keys.unshift(activeKey);
      seen.add(activeKey);
    }
    if (
      nextKey &&
      !seen.has(nextKey) &&
      (!workspaceId || pathBelongsToWorkspace(nextKey, workspaceId))
    ) {
      keys.push(nextKey);
    }
    return keys;
  }, [activeKey, nextKey, tabs, workspaceId]);

  // Remount pane hosts when the workspace changes so snapshots cannot leak.
  if (cacheWorkspaceId !== workspaceId) {
    setCacheWorkspaceId(workspaceId);
    setPaneEpoch((n) => n + 1);
    setSealedPanes(new Map());
  }

  // Keep the last good live tree in a ref for synchronous seal on link click.
  useLayoutEffect(() => {
    if (!enabled) return;
    liveRef.current = {
      key: nextKey,
      node:
        !isTabCachePlaceholder(children) && children != null
          ? children
          : liveRef.current.node,
    };
  }, [children, enabled, nextKey]);

  useEffect(() => {
    return subscribeAppLoading(({ navigating }) => {
      setRouteLeaving(navigating);
    });
  }, []);

  // When a soft-nav starts, seal/refresh the current live pane BEFORE children swap.
  useEffect(() => {
    return subscribeNavigationSeal(() => {
      const { key, node } = liveRef.current;
      if (!key || !node || isTabCachePlaceholder(node)) return;
      setSealedPanes((prev) => {
        const next = new Map(prev);
        next.set(key, node);
        return next;
      });
    });
  }, []);

  // After navigation settles, seed the live route once (do not overwrite an
  // existing seal — that would re-introduce Tab-N-into-Tab-1 races).
  useLayoutEffect(() => {
    if (!enabled || routeLeaving) return;
    if (!nextKey || isTabCachePlaceholder(children)) return;
    setSealedPanes((prev) => {
      const existing = prev.get(nextKey);
      if (existing && !isTabCachePlaceholder(existing)) return prev;
      if (existing === children) return prev;
      const next = new Map(prev);
      next.set(nextKey, children);
      return next;
    });
  }, [children, enabled, nextKey, routeLeaving]);

  // Drop seals for closed tabs.
  useLayoutEffect(() => {
    if (!enabled) return;
    const allowed = new Set(mountedKeys);
    setSealedPanes((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const key of [...next.keys()]) {
        if (!allowed.has(key)) {
          next.delete(key);
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
        const sealed = sealedPanes.get(key);

        // Live Next route shows children once settled. All other tabs (and the
        // live route while leaving) only show their sealed snapshot — never
        // adopt another tab's tree.
        let pane = null;
        if (isLive && !routeLeaving && !isTabCachePlaceholder(children)) {
          pane = children;
        } else if (sealed && !isTabCachePlaceholder(sealed)) {
          pane = sealed;
        }

        if (!pane) return null;

        return (
          <TabPaneActivityProvider
            key={`${paneEpoch}:${key}`}
            paneHref={key}
            isActive={isActive}
          >
            <Activity mode={isActive ? "visible" : "hidden"}>
              <div
                className={isActive ? "flex min-h-0 min-w-0 flex-1 flex-col" : "flex min-h-0 min-w-0 flex-1 flex-col"}
                data-tab-workspace-pane={key}
                data-tab-suspended={!isActive || undefined}
              >
                <TabPaneRouterFreeze href={key}>{pane}</TabPaneRouterFreeze>
              </div>
            </Activity>
          </TabPaneActivityProvider>
        );
      })}
    </>
  );
}
