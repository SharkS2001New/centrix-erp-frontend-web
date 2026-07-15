"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import {
  TAB_WORKSPACE_MAX_TABS,
  findOpenTab,
  getWorkspaceTabState,
  hrefFromLinkProp,
  isTabWorkspaceEnabled,
  isTabWorkspaceRoute,
  normalizeTabHref,
  readTabWorkspaceStore,
  setOpenTabReuseChecker,
  shouldReuseOpenTab,
  syncOpenTabUrl,
  tabPaneKey,
  titleFromPathname,
  writeTabWorkspaceStore,
} from "@/lib/tab-workspace";
import { finishNavigation } from "@/lib/app-loading";
import {
  pathBelongsToWorkspace,
  resolveActiveWorkspace,
  resolveAvailableWorkspaces,
  workspaceHomePath,
} from "@/lib/workspaces";

const TabWorkspaceContext = createContext({
  enabled: false,
  workspaceId: null,
  tabs: [],
  activeHref: "/",
  openTab: () => {},
  closeTab: () => {},
  activateTab: () => {},
  navigateToHref: () => {},
  handleTabLinkClick: () => false,
  setTabTitle: () => {},
  markTabDirty: () => {},
  clearTabDirty: () => {},
});

function updateWorkspaceTabs(store, workspaceId, updater) {
  const current = getWorkspaceTabState(store, workspaceId);
  const next = updater(current);
  if (next === current) return store;
  return { ...store, [workspaceId]: next };
}

export function TabWorkspaceProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { capabilities, organization, user, isSuperAdmin } = useAuth();
  const enabled = isTabWorkspaceEnabled(capabilities);
  const [tabStore, setTabStore] = useState({});
  const titleOverridesRef = useRef(new Map());
  const prevWorkspaceIdRef = useRef(null);

  const ctx = useMemo(
    () =>
      buildAccessContext({
        user,
        organization,
        capabilities,
        requireTillFloat: resolveTillFloatNavFlag(capabilities),
        isSuperAdmin,
      }),
    [capabilities, isSuperAdmin, organization, user],
  );

  const workspaces = useMemo(
    () => resolveAvailableWorkspaces(ctx, capabilities),
    [capabilities, ctx],
  );

  const workspaceId = useMemo(
    () => resolveActiveWorkspace(workspaces, getStoredWorkspace(), pathname)?.id ?? null,
    [workspaces, pathname],
  );

  const tabs = useMemo(
    () => (workspaceId ? getWorkspaceTabState(tabStore, workspaceId).tabs : []),
    [tabStore, workspaceId],
  );

  const storeActiveHref = useMemo(() => {
    if (!workspaceId) return normalizeTabHref(pathname);
    const state = getWorkspaceTabState(tabStore, workspaceId);
    if (state.activeHref && pathBelongsToWorkspace(state.activeHref, workspaceId)) {
      return state.activeHref;
    }
    const fromPath = normalizeTabHref(pathname);
    if (pathBelongsToWorkspace(fromPath, workspaceId)) return fromPath;
    return state.tabs[0]?.href ?? workspaceHomePath(workspaceId, capabilities);
  }, [capabilities, pathname, tabStore, workspaceId]);

  useEffect(() => {
    if (!enabled) {
      setOpenTabReuseChecker(null);
      return undefined;
    }

    setOpenTabReuseChecker((href) => {
      const normalized = hrefFromLinkProp(href);
      if (!workspaceId || !isTabWorkspaceRoute(normalized)) return false;
      if (!pathBelongsToWorkspace(normalized, workspaceId)) return false;
      return Boolean(findOpenTab(tabs, normalized));
    });

    return () => setOpenTabReuseChecker(null);
  }, [enabled, tabs, workspaceId]);

  useEffect(() => {
    if (!enabled) {
      setTabStore({});
      return;
    }
    setTabStore(readTabWorkspaceStore(organization?.id));
  }, [enabled, organization?.id]);

  useEffect(() => {
    if (!enabled) return;
    writeTabWorkspaceStore(organization?.id, tabStore);
  }, [enabled, organization?.id, tabStore]);

  useEffect(() => {
    if (prevWorkspaceIdRef.current !== null && prevWorkspaceIdRef.current !== workspaceId) {
      titleOverridesRef.current = new Map();
    }
    prevWorkspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  const upsertTab = useCallback(
    (href, title, { dirty = false } = {}) => {
      const normalized = hrefFromLinkProp(href);
      if (!workspaceId || !isTabWorkspaceRoute(normalized)) return;
      if (!pathBelongsToWorkspace(normalized, workspaceId)) return;
      const paneKey = tabPaneKey(normalized);
      const storageHref = normalizeTabHref(paneKey);

      setTabStore((store) =>
        updateWorkspaceTabs(store, workspaceId, (current) => {
          const existing =
            current.tabs.find((tab) => tab.href === storageHref) ??
            current.tabs.find((tab) => tabPaneKey(tab.href) === paneKey);
          const resolvedTitle =
            titleOverridesRef.current.get(storageHref) ??
            titleOverridesRef.current.get(normalized) ??
            title ??
            titleFromPathname(storageHref);

          if (existing) {
            return {
              ...current,
              activeHref: storageHref,
              tabs: current.tabs.map((tab) =>
                tabPaneKey(tab.href) === paneKey
                  ? {
                      ...tab,
                      href: storageHref,
                      title: resolvedTitle,
                      dirty: dirty || tab.dirty,
                      lastActiveAt: Date.now(),
                    }
                  : tab,
              ),
            };
          }

          const dedupedTabs = current.tabs.filter((tab) => tabPaneKey(tab.href) !== paneKey);
          const nextTabs = [
            ...dedupedTabs,
            {
              href: storageHref,
              title: resolvedTitle,
              dirty,
              lastActiveAt: Date.now(),
            },
          ];

          if (nextTabs.length <= TAB_WORKSPACE_MAX_TABS) {
            return { ...current, activeHref: storageHref, tabs: nextTabs };
          }

          const sorted = [...nextTabs].sort(
            (a, b) => (a.lastActiveAt ?? 0) - (b.lastActiveAt ?? 0),
          );
          const evicted = sorted[0]?.href;
          return {
            ...current,
            activeHref: storageHref,
            tabs: nextTabs.filter((tab) => tab.href !== evicted),
          };
        }),
      );
    },
    [workspaceId],
  );

  useEffect(() => {
    if (!enabled || !workspaceId || !pathname || !isTabWorkspaceRoute(pathname)) return;
    if (!pathBelongsToWorkspace(pathname, workspaceId)) return;
    upsertTab(pathname, titleFromPathname(pathname));
  }, [enabled, pathname, upsertTab, workspaceId]);

  useEffect(() => {
    if (!enabled || !workspaceId || !pathname || !isTabWorkspaceRoute(pathname)) return;
    if (!pathBelongsToWorkspace(pathname, workspaceId)) return;

    const fromRouter = normalizeTabHref(pathname);
    const fromWindow =
      typeof window !== "undefined"
        ? normalizeTabHref(`${window.location.pathname}${window.location.search}`)
        : fromRouter;
    // When switching open tabs we only history.pushState — Next's pathname can lag.
    // Prefer the browser URL when it still points at an open tab.
    const normalized =
      fromWindow && findOpenTab(tabs, fromWindow) ? fromWindow : fromRouter;

    setTabStore((store) =>
      updateWorkspaceTabs(store, workspaceId, (current) => {
        if (current.activeHref === normalized) return current;
        return { ...current, activeHref: normalized };
      }),
    );
  }, [enabled, pathname, tabs, workspaceId]);

  const switchToHref = useCallback(
    (href) => {
      const normalized = hrefFromLinkProp(href);
      const isCurrent = normalizeTabHref(pathname) === normalized;
      const storeCurrent = storeActiveHref === normalized;

      if (
        enabled &&
        workspaceId &&
        isTabWorkspaceRoute(normalized) &&
        pathBelongsToWorkspace(normalized, workspaceId) &&
        findOpenTab(tabs, normalized)
      ) {
        setTabStore((store) =>
          updateWorkspaceTabs(store, workspaceId, (current) => {
            const existing = current.tabs.find((tab) => tab.href === normalized);
            if (!existing) return current;

            return {
              ...current,
              activeHref: normalized,
              tabs: current.tabs.map((tab) =>
                tab.href === normalized ? { ...tab, lastActiveAt: Date.now() } : tab,
              ),
            };
          }),
        );

        // Reuse the mounted keep-alive pane — do not router.push / bare pushState.
        // Next patches history and would ACTION_RESTORE → remount + refetch.
        finishNavigation();
        if (!isCurrent || !storeCurrent) {
          try {
            syncOpenTabUrl(normalized);
          } catch {
            /* address bar sync is best-effort; pane switch already applied */
          }
        }
        return true;
      }

      if (!isCurrent) router.push(normalized);
      return false;
    },
    [enabled, pathname, router, storeActiveHref, tabs, workspaceId],
  );

  const activateTab = useCallback(
    (href) => {
      switchToHref(href);
    },
    [switchToHref],
  );

  const navigateToHref = useCallback(
    (href, { replace = false } = {}) => {
      const normalized = hrefFromLinkProp(href);
      const isCurrent = normalizeTabHref(pathname) === normalized;

      if (isCurrent) return;

      if (
        enabled &&
        workspaceId &&
        isTabWorkspaceRoute(normalized) &&
        pathBelongsToWorkspace(normalized, workspaceId) &&
        findOpenTab(tabs, normalized)
      ) {
        switchToHref(normalized);
        return;
      }

      if (replace) router.replace(normalized);
      else router.push(normalized);
    },
    [enabled, pathname, router, switchToHref, tabs, workspaceId],
  );

  const handleTabLinkClick = useCallback(
    (href, event) => {
      if (!enabled || !event || event.defaultPrevented) return false;

      const normalized = hrefFromLinkProp(href);
      if (!isTabWorkspaceRoute(normalized)) return false;
      if (!workspaceId || !pathBelongsToWorkspace(normalized, workspaceId)) return false;
      if (!findOpenTab(tabs, normalized)) return false;

      event.preventDefault();
      switchToHref(normalized);
      return true;
    },
    [enabled, switchToHref, tabs, workspaceId],
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const onDocumentClick = (event) => {
      if (event.defaultPrevented) return;

      const anchor = event.target?.closest?.("a[href]");
      if (!shouldReuseOpenTab(anchor, event)) return;

      const normalized = normalizeTabHref(anchor.getAttribute("href"));
      if (!isTabWorkspaceRoute(normalized)) return;
      if (!workspaceId || !pathBelongsToWorkspace(normalized, workspaceId)) return;
      if (!findOpenTab(tabs, normalized)) return;

      event.preventDefault();
      switchToHref(normalized);
    };

    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [enabled, switchToHref, tabs, workspaceId]);

  const closeTab = useCallback(
    (href) => {
      const normalized = normalizeTabHref(href);
      if (!workspaceId) return;

      setTabStore((store) =>
        updateWorkspaceTabs(store, workspaceId, (current) => {
          const index = current.tabs.findIndex((tab) => tab.href === normalized);
          if (index === -1) return current;

          const nextTabs = current.tabs.filter((tab) => tab.href !== normalized);
          titleOverridesRef.current.delete(normalized);

          if (normalizeTabHref(pathname) === normalized) {
            const fallback = nextTabs[Math.max(0, index - 1)] ?? nextTabs[0];
            if (fallback?.href) {
              router.push(fallback.href);
            } else {
              router.push(workspaceHomePath(workspaceId, capabilities));
            }
          } else if (current.activeHref === normalized) {
            // Closed the visible keep-alive tab while Next is still on another
            // open route — flip to the neighbor without soft-navigating.
            const fallback = nextTabs[Math.max(0, index - 1)] ?? nextTabs[0];
            if (fallback?.href) {
              queueMicrotask(() => {
                try {
                  syncOpenTabUrl(fallback.href);
                } catch {
                  /* ignore */
                }
              });
            }
          }

          return {
            ...current,
            tabs: nextTabs,
            activeHref:
              current.activeHref === normalized
                ? (nextTabs[Math.max(0, index - 1)]?.href ?? nextTabs[0]?.href ?? null)
                : current.activeHref,
          };
        }),
      );
    },
    [capabilities, pathname, router, workspaceId],
  );

  const setTabTitle = useCallback(
    (href, title) => {
      const normalized = normalizeTabHref(href);
      if (!workspaceId) return;

      titleOverridesRef.current.set(normalized, title);
      setTabStore((store) =>
        updateWorkspaceTabs(store, workspaceId, (current) => ({
          ...current,
          tabs: current.tabs.map((tab) => (tab.href === normalized ? { ...tab, title } : tab)),
        })),
      );
    },
    [workspaceId],
  );

  const markTabDirty = useCallback(
    (href) => {
      const normalized = normalizeTabHref(href ?? pathname);
      if (!workspaceId) return;

      setTabStore((store) =>
        updateWorkspaceTabs(store, workspaceId, (current) => ({
          ...current,
          tabs: current.tabs.map((tab) =>
            tab.href === normalized ? { ...tab, dirty: true } : tab,
          ),
        })),
      );
    },
    [pathname, workspaceId],
  );

  const clearTabDirty = useCallback(
    (href) => {
      const normalized = normalizeTabHref(href ?? pathname);
      if (!workspaceId) return;

      setTabStore((store) =>
        updateWorkspaceTabs(store, workspaceId, (current) => ({
          ...current,
          tabs: current.tabs.map((tab) =>
            tab.href === normalized ? { ...tab, dirty: false } : tab,
          ),
        })),
      );
    },
    [pathname, workspaceId],
  );

  const value = useMemo(
    () => ({
      enabled,
      workspaceId,
      tabs,
      activeHref: storeActiveHref,
      openTab: upsertTab,
      closeTab,
      activateTab,
      navigateToHref,
      handleTabLinkClick,
      setTabTitle,
      markTabDirty,
      clearTabDirty,
    }),
    [
      enabled,
      workspaceId,
      tabs,
      storeActiveHref,
      upsertTab,
      closeTab,
      activateTab,
      navigateToHref,
      handleTabLinkClick,
      setTabTitle,
      markTabDirty,
      clearTabDirty,
    ],
  );

  return <TabWorkspaceContext.Provider value={value}>{children}</TabWorkspaceContext.Provider>;
}

export function useTabWorkspace() {
  return useContext(TabWorkspaceContext);
}

/** Override the active tab title (e.g. customer name on a detail page). */
export function useTabTitle(title) {
  const pathname = usePathname();
  const { enabled, setTabTitle } = useTabWorkspace();

  useEffect(() => {
    if (!enabled || !title) return;
    setTabTitle(pathname, title);
  }, [enabled, pathname, setTabTitle, title]);
}
