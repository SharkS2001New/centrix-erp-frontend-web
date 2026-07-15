"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
 * One host per route path. Only the live Next pathname host is given
 * `liveChildren`. Other hosts keep private snapshots and stay `hidden`.
 *
 * On soft-nav start we synchronously lock + seal the live host so the next
 * page tree cannot overwrite earlier tabs (Dashboard showing Receive stock).
 */
function TabPaneHost({ paneKey, isLive, isActive, liveChildren, routeLeaving }) {
  const [snapshot, setSnapshot] = useState(null);
  const [locked, setLocked] = useState(false);
  const isLiveRef = useRef(isLive);
  const liveChildrenRef = useRef(liveChildren);
  const snapshotRef = useRef(snapshot);

  useLayoutEffect(() => {
    isLiveRef.current = isLive;
    if (liveChildren != null && !isTabCachePlaceholder(liveChildren)) {
      liveChildrenRef.current = liveChildren;
    }
    snapshotRef.current = snapshot;
  }, [isLive, liveChildren, snapshot]);

  useEffect(() => {
    return subscribeNavigationSeal(() => {
      if (!isLiveRef.current) return;
      setLocked(true);
      const node = liveChildrenRef.current ?? snapshotRef.current;
      if (!node || isTabCachePlaceholder(node)) return;
      setSnapshot(node);
    });
  }, []);

  useLayoutEffect(() => {
    if (!isLive) {
      setLocked(false);
      return;
    }
    if (routeLeaving || locked) return;
    if (!liveChildren || isTabCachePlaceholder(liveChildren)) return;
    setSnapshot((prev) => (prev === liveChildren ? prev : liveChildren));
  }, [isLive, liveChildren, routeLeaving, locked]);

  const canShowLive =
    isLive &&
    !routeLeaving &&
    !locked &&
    liveChildren != null &&
    !isTabCachePlaceholder(liveChildren);

  const pane = canShowLive ? liveChildren : snapshot;
  if (!pane || isTabCachePlaceholder(pane)) return null;

  return (
    <TabPaneActivityProvider paneHref={paneKey} isActive={isActive}>
      <div
        className={isActive ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}
        aria-hidden={!isActive}
        hidden={!isActive}
        data-tab-workspace-pane={paneKey}
        data-tab-suspended={!isActive || undefined}
      >
        <TabPaneRouterFreeze href={paneKey}>{pane}</TabPaneRouterFreeze>
      </div>
    </TabPaneActivityProvider>
  );
}

/**
 * Keep every open workspace tab mounted. Next only supplies one live `children`
 * tree — that tree is passed only into the matching path host.
 */
export function TabWorkspaceMain({ children }) {
  const pathname = usePathname();
  const { enabled, tabs, activeHref: workspaceActiveHref, workspaceId } = useTabWorkspace();
  const [cacheWorkspaceId, setCacheWorkspaceId] = useState(workspaceId);
  const [paneEpoch, setPaneEpoch] = useState(0);
  const [routeLeaving, setRouteLeaving] = useState(() => isNavigationPending());

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

  if (cacheWorkspaceId !== workspaceId) {
    setCacheWorkspaceId(workspaceId);
    setPaneEpoch((n) => n + 1);
  }

  useEffect(() => {
    return subscribeAppLoading(({ navigating }) => {
      setRouteLeaving(navigating);
    });
  }, []);

  if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) {
    return children;
  }

  return (
    <>
      {mountedKeys.map((key) => (
        <TabPaneHost
          key={`${paneEpoch}:${key}`}
          paneKey={key}
          isLive={key === nextKey}
          isActive={key === activeKey}
          routeLeaving={routeLeaving}
          liveChildren={key === nextKey ? children : null}
        />
      ))}
    </>
  );
}
