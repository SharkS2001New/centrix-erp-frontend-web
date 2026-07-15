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
  isTabPaneMounted,
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
      if (!findOpenTab(tabs, normalized)) return false;
      // Only skip soft-nav when the page was already visited this session.
      return isTabPaneMounted(tabPaneKey(normalized));
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

  // Real Next navigations update which tab is active.
  useEffect(() => {
    if (!enabled || !workspaceId || !pathname || !isTabWorkspaceRoute(pathname)) return;
    if (!pathBelongsToWorkspace(pathname, workspaceId)) return;

    const storageHref = normalizeTabHref(tabPaneKey(pathname));
    setTabStore((store) =>
      updateWorkspaceTabs(store, workspaceId, (current) => {
        if (tabPaneKey(current.activeHref ?? "") === tabPaneKey(storageHref)) return current;
        return { ...current, activeHref: storageHref };
      }),
    );
  }, [enabled, pathname, workspaceId]);

  const switchToHref = useCallback(
    (href) => {
      const normalized = hrefFromLinkProp(href);
      const paneKey = tabPaneKey(normalized);
      const storageHref = normalizeTabHref(paneKey);
      const isCurrentPath = tabPaneKey(pathname) === paneKey;
      const isStoreCurrent = tabPaneKey(storeActiveHref) === paneKey;
      const open = Boolean(findOpenTab(tabs, normalized));
      const mounted = isTabPaneMounted(paneKey);

      if (
        enabled &&
        workspaceId &&
        isTabWorkspaceRoute(normalized) &&
        pathBelongsToWorkspace(normalized, workspaceId) &&
        open &&
        mounted
      ) {
        setTabStore((store) =>
          updateWorkspaceTabs(store, workspaceId, (current) => ({
            ...current,
            activeHref: storageHref,
            tabs: current.tabs.map((tab) =>
              tabPaneKey(tab.href) === paneKey
                ? { ...tab, lastActiveAt: Date.now() }
                : tab,
            ),
          })),
        );

        // Already visited this session — show cached pane, no router remount.
        finishNavigation();
        if (!isCurrentPath || !isStoreCurrent) {
          try {
            syncOpenTabUrl(storageHref);
          } catch {
            /* best-effort URL sync */
          }
        }
        return true;
      }

      if (!isCurrentPath) router.push(storageHref);
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
      const storageHref = normalizeTabHref(tabPaneKey(normalized));

      if (
        enabled &&
        workspaceId &&
        findOpenTab(tabs, normalized) &&
        isTabPaneMounted(tabPaneKey(normalized))
      ) {
        switchToHref(normalized);
        return;
      }

      if (tabPaneKey(pathname) === tabPaneKey(normalized)) return;
      if (replace) router.replace(storageHref);
      else router.push(storageHref);
    },
    [enabled, pathname, router, switchToHref, tabs, workspaceId],
  );

  const handleTabLinkClick = useCallback(
    (href, event) => {
      if (!enabled || !event || event.defaultPrevented) return false;

      const normalized = hrefFromLinkProp(href);
      if (!isTabWorkspaceRoute(normalized)) return false;
      if (!workspaceId || !pathBelongsToWorkspace(normalized, workspaceId)) return false;
      if (!findOpenTab(tabs, normalized) || !isTabPaneMounted(tabPaneKey(normalized))) {
        return false;
      }

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
      if (!findOpenTab(tabs, normalized) || !isTabPaneMounted(tabPaneKey(normalized))) return;

      event.preventDefault();
      switchToHref(normalized);
    };

    document.addEventListener("click", onDocumentClick, true);
    return () => document.removeEventListener("click", onDocumentClick, true);
  }, [enabled, switchToHref, tabs, workspaceId]);

  const closeTab = useCallback(
    (href) => {
      const normalized = normalizeTabHref(href);
      const paneKey = tabPaneKey(normalized);
      if (!workspaceId) return;

      setTabStore((store) =>
        updateWorkspaceTabs(store, workspaceId, (current) => {
          const index = current.tabs.findIndex((tab) => tabPaneKey(tab.href) === paneKey);
          if (index === -1) return current;

          const nextTabs = current.tabs.filter((tab) => tabPaneKey(tab.href) !== paneKey);
          titleOverridesRef.current.delete(normalized);

          const closingActive =
            tabPaneKey(pathname) === paneKey ||
            tabPaneKey(current.activeHref ?? "") === paneKey;

          if (closingActive) {
            const fallback = nextTabs[Math.max(0, index - 1)] ?? nextTabs[0];
            if (fallback?.href) {
              // Prefer cached switch when possible; else soft-nav.
              if (isTabPaneMounted(tabPaneKey(fallback.href))) {
                queueMicrotask(() => {
                  try {
                    syncOpenTabUrl(fallback.href);
                  } catch {
                    /* ignore */
                  }
                });
              } else {
                router.push(fallback.href);
              }
            } else {
              router.push(workspaceHomePath(workspaceId, capabilities));
            }
          }

          return {
            ...current,
            tabs: nextTabs,
            activeHref:
              tabPaneKey(current.activeHref ?? "") === paneKey
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
          tabs: current.tabs.map((tab) =>
            tabPaneKey(tab.href) === tabPaneKey(normalized) ? { ...tab, title } : tab,
          ),
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
            tabPaneKey(tab.href) === tabPaneKey(normalized) ? { ...tab, dirty: true } : tab,
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
            tabPaneKey(tab.href) === tabPaneKey(normalized) ? { ...tab, dirty: false } : tab,
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

export function useTabTitle(title) {
  const pathname = usePathname();
  const { enabled, setTabTitle } = useTabWorkspace();

  useEffect(() => {
    if (!enabled || !title) return;
    setTabTitle(pathname, title);
  }, [enabled, pathname, setTabTitle, title]);
}
