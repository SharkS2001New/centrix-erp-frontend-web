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
import {
  TAB_WORKSPACE_MAX_TABS,
  isTabWorkspaceEnabled,
  isTabWorkspaceRoute,
  normalizeTabHref,
  tabStorageKey,
  titleFromPathname,
} from "@/lib/tab-workspace";

const TabWorkspaceContext = createContext({
  enabled: false,
  tabs: [],
  activeHref: "/",
  openTab: () => {},
  closeTab: () => {},
  activateTab: () => {},
  setTabTitle: () => {},
  markTabDirty: () => {},
  clearTabDirty: () => {},
});

function readStoredTabs(storageKey) {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeStoredTabs(storageKey, tabs) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(tabs));
  } catch {
    // ignore quota errors
  }
}

export function TabWorkspaceProvider({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { capabilities, organization } = useAuth();
  const enabled = isTabWorkspaceEnabled(capabilities);
  const storageKey = tabStorageKey(organization?.id);
  const [tabs, setTabs] = useState([]);
  const titleOverridesRef = useRef(new Map());

  useEffect(() => {
    if (!enabled) {
      setTabs([]);
      return;
    }
    setTabs(readStoredTabs(storageKey));
  }, [enabled, storageKey]);

  useEffect(() => {
    if (!enabled) return;
    writeStoredTabs(storageKey, tabs);
  }, [enabled, storageKey, tabs]);

  const upsertTab = useCallback(
    (href, title, { dirty = false } = {}) => {
      const normalized = normalizeTabHref(href);
      if (!isTabWorkspaceRoute(normalized)) return;

      setTabs((current) => {
        const existing = current.find((tab) => tab.href === normalized);
        const resolvedTitle = titleOverridesRef.current.get(normalized) ?? title ?? titleFromPathname(normalized);

        if (existing) {
          return current.map((tab) =>
            tab.href === normalized
              ? {
                  ...tab,
                  title: resolvedTitle,
                  dirty: dirty || tab.dirty,
                  lastActiveAt: Date.now(),
                }
              : tab,
          );
        }

        const next = [
          ...current,
          {
            href: normalized,
            title: resolvedTitle,
            dirty,
            lastActiveAt: Date.now(),
          },
        ];

        if (next.length <= TAB_WORKSPACE_MAX_TABS) {
          return next;
        }

        const sorted = [...next].sort((a, b) => (a.lastActiveAt ?? 0) - (b.lastActiveAt ?? 0));
        const evicted = sorted[0]?.href;
        return next.filter((tab) => tab.href !== evicted);
      });
    },
    [],
  );

  useEffect(() => {
    if (!enabled || !pathname || !isTabWorkspaceRoute(pathname)) return;
    upsertTab(pathname, titleFromPathname(pathname));
  }, [enabled, pathname, upsertTab]);

  const activateTab = useCallback(
    (href) => {
      const normalized = normalizeTabHref(href);
      if (normalized === normalizeTabHref(pathname)) return;
      router.push(normalized);
    },
    [pathname, router],
  );

  const closeTab = useCallback(
    (href) => {
      const normalized = normalizeTabHref(href);
      setTabs((current) => {
        const index = current.findIndex((tab) => tab.href === normalized);
        if (index === -1) return current;

        const next = current.filter((tab) => tab.href !== normalized);
        titleOverridesRef.current.delete(normalized);

        if (normalizeTabHref(pathname) === normalized) {
          const fallback = next[Math.max(0, index - 1)] ?? next[0];
          if (fallback?.href) {
            router.push(fallback.href);
          } else {
            router.push("/");
          }
        }

        return next;
      });
    },
    [pathname, router],
  );

  const setTabTitle = useCallback((href, title) => {
    const normalized = normalizeTabHref(href);
    titleOverridesRef.current.set(normalized, title);
    setTabs((current) =>
      current.map((tab) => (tab.href === normalized ? { ...tab, title } : tab)),
    );
  }, []);

  const markTabDirty = useCallback((href) => {
    const normalized = normalizeTabHref(href ?? pathname);
    setTabs((current) =>
      current.map((tab) => (tab.href === normalized ? { ...tab, dirty: true } : tab)),
    );
  }, [pathname]);

  const clearTabDirty = useCallback((href) => {
    const normalized = normalizeTabHref(href ?? pathname);
    setTabs((current) =>
      current.map((tab) => (tab.href === normalized ? { ...tab, dirty: false } : tab)),
    );
  }, [pathname]);

  const value = useMemo(
    () => ({
      enabled,
      tabs,
      activeHref: normalizeTabHref(pathname),
      openTab: upsertTab,
      closeTab,
      activateTab,
      setTabTitle,
      markTabDirty,
      clearTabDirty,
    }),
    [enabled, tabs, pathname, upsertTab, closeTab, activateTab, setTabTitle, markTabDirty, clearTabDirty],
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
