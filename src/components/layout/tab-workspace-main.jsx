"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { TabPaneActivityProvider } from "@/contexts/tab-pane-activity-context";
import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { TabPaneRouterFreeze } from "@/components/layout/tab-pane-router-freeze";
import { SCREEN_COMPONENTS } from "@/lib/screen-registry-components";
import {
  isRegisteredHref,
  pathnameFromTabHref,
  resolveScreen,
} from "@/lib/screen-registry";
import { isTabWorkspaceRoute, normalizeTabHref } from "@/lib/tab-workspace";

/**
 * Desktop Tab Manager host.
 *
 * Registered screens stay mounted while their tab is open — one instance per
 * concrete pathname (so /customers/1 and /customers/2 are separate panes).
 * Unregistered routes use live Next.js `children` for the active URL only.
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
        <Screen />
      </TabPaneRouterFreeze>
    </div>
  );
}

export function TabWorkspaceMain({ children }) {
  const pathname = usePathname();
  const { enabled, tabs, activeHref: workspaceActiveHref } = useTabWorkspace();

  const routeHref = normalizeTabHref(pathname);
  const activeHref = normalizeTabHref(workspaceActiveHref || routeHref);
  const activePath = pathnameFromTabHref(activeHref);
  const activeIsRegistered = isRegisteredHref(activeHref);

  /** One mounted instance per concrete pathname (query string ignored). */
  const registeredPanes = useMemo(() => {
    /** @type {Map<string, { path: string, href: string, entry: NonNullable<ReturnType<typeof resolveScreen>> }>} */
    const byPath = new Map();

    for (const tab of tabs) {
      const href = normalizeTabHref(tab.href);
      const entry = resolveScreen(href);
      if (!entry) continue;
      const path = pathnameFromTabHref(href);
      if (!byPath.has(path) || path === activePath) {
        byPath.set(path, { path, href, entry });
      }
    }

    if (activeHref && isRegisteredHref(activeHref)) {
      const entry = resolveScreen(activeHref);
      if (entry) {
        byPath.set(activePath, { path: activePath, href: activeHref, entry });
      }
    }

    return [...byPath.values()];
  }, [activeHref, activePath, tabs]);

  if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) {
    return children;
  }

  return (
    <>
      {registeredPanes.map(({ path, href, entry }) => {
        const isActive = path === activePath;
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
