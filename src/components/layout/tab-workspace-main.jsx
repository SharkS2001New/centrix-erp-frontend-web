"use client";

import { Suspense, useMemo } from "react";
import { usePathname } from "next/navigation";
import { TabPaneActivityProvider } from "@/contexts/tab-pane-activity-context";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { TabPaneRouterFreeze } from "@/components/layout/tab-pane-router-freeze";
import { AppErrorBoundary } from "@/components/shared/app-error-boundary";
import { AppRouteLoading } from "@/components/shared/app-route-loading";
import { SCREEN_COMPONENTS } from "@/lib/screen-registry-components";
import {
  isRegisteredHref,
  pathnameFromTabHref,
  resolveScreen,
} from "@/lib/screen-registry";
import {
  isTabWorkspaceRoute,
  normalizeTabHref,
  pathOnlyFromHref,
  shouldKeepTabPaneMounted,
} from "@/lib/tab-workspace";

/**
 * Desktop Tab Manager host.
 *
 * Registered screens stay mounted while their tab is open — one instance per
 * concrete pathname (so /customers/1 and /customers/2 are separate panes).
 * Heavy / idle panes are soft-evicted (unmounted) to free memory; they remount
 * when the tab is activated again.
 * Unregistered routes use live Next.js `children` for the active URL only.
 * Screen modules load on first open via React.lazy.
 */
function RegisteredTabPane({ entry, paneHref, isActive }) {
  const Screen = SCREEN_COMPONENTS[entry.id];
  if (!Screen) return null;
  return (
    <div
      className={isActive ? "flex min-h-0 min-w-0 flex-1 flex-col" : "hidden"}
      aria-hidden={!isActive}
      data-tab-workspace-pane={paneHref}
      data-tab-suspended={!isActive || undefined}
      data-tab-registry={entry.id}
    >
      <TabPaneRouterFreeze href={paneHref}>
        <AppErrorBoundary>
          <Suspense fallback={<AppRouteLoading label="Loading page…" />}>
            <Screen />
          </Suspense>
        </AppErrorBoundary>
      </TabPaneRouterFreeze>
    </div>
  );
}

export function TabWorkspaceMain({ children }) {
  const pathname = usePathname();
  const { enabled, tabs, activeHref: workspaceActiveHref } = useTabWorkspace();

  const routeHref = normalizeTabHref(pathname);
  const storedActiveHref = workspaceActiveHref ? normalizeTabHref(workspaceActiveHref) : null;
  // Prefer the live route when the stored active tab belongs to another path (e.g. after
  // switching back to Backoffice while Create order was still the last active tab).
  const activeHref =
    storedActiveHref &&
    pathOnlyFromHref(storedActiveHref) === pathOnlyFromHref(routeHref)
      ? storedActiveHref
      : routeHref;
  const activePath = pathnameFromTabHref(activeHref);
  const activeIsRegistered = isRegisteredHref(activeHref);

  /** One mounted instance per concrete pathname (query string ignored). */
  const registeredPanes = useMemo(() => {
    /** @type {Map<string, { path: string, href: string, entry: NonNullable<ReturnType<typeof resolveScreen>>, lastActiveAt: number }>} */
    const byPath = new Map();

    for (const tab of tabs) {
      const href = normalizeTabHref(tab.href);
      const entry = resolveScreen(href);
      if (!entry) continue;
      const path = pathnameFromTabHref(href);
      const lastActiveAt = Number(tab.lastActiveAt ?? 0);
      const existing = byPath.get(path);
      if (!existing || path === activePath || lastActiveAt >= (existing.lastActiveAt ?? 0)) {
        byPath.set(path, { path, href, entry, lastActiveAt });
      }
    }

    if (activeHref && isRegisteredHref(activeHref)) {
      const entry = resolveScreen(activeHref);
      if (entry) {
        byPath.set(activePath, {
          path: activePath,
          href: activeHref,
          entry,
          lastActiveAt: Date.now(),
        });
      }
    }

    const panes = [...byPath.values()];
    const inactiveSorted = panes
      .filter((pane) => pane.path !== activePath)
      .sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0));
    const inactiveRank = new Map(
      inactiveSorted.map((pane, index) => [pane.path, index]),
    );

    return panes.map((pane) => {
      const isActive = pane.path === activePath;
      const keepMounted = shouldKeepTabPaneMounted({
        entryId: pane.entry.id,
        isActive,
        inactiveKeepRank: inactiveRank.get(pane.path) ?? -1,
      });
      return { ...pane, isActive, keepMounted };
    });
  }, [activeHref, activePath, tabs]);

  if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) {
    return children;
  }

  return (
    <>
      {registeredPanes.map(({ path, href, entry, isActive, keepMounted }) => {
        if (!keepMounted) return null;
        return (
          <TabPaneActivityProvider key={`registry:${path}`} paneHref={href} isActive={isActive}>
            <RegisteredTabPane entry={entry} paneHref={href} isActive={isActive} />
          </TabPaneActivityProvider>
        );
      })}

      {!activeIsRegistered ? (
        <TabPaneActivityProvider key={`next:${activePath}`} paneHref={activeHref} isActive>
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col"
            data-tab-workspace-pane={activeHref}
          >
            {children}
          </div>
        </TabPaneActivityProvider>
      ) : null}
    </>
  );
}
