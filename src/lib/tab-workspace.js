/** Desktop-style in-app tab workspace (platform-controlled per organization). */

import { pathBelongsToWorkspace } from "@/lib/workspaces";

export const TAB_WORKSPACE_MAX_TABS = 10;

/** Routes that always use full-page navigation without the tab bar. */
export const TAB_WORKSPACE_EXCLUDED_PREFIXES = [
  "/sales/pos",
  "/change-password",
  "/login",
  "/platform",
];

export function isTabWorkspaceEnabled(capabilities) {
  return capabilities?.platform_tab_workspace_enabled !== false;
}

export function isTabWorkspaceRoute(pathname) {
  if (!pathname || pathname === "/") return true;
  return !TAB_WORKSPACE_EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function normalizeTabHref(href) {
  if (!href) return "/";
  try {
    const url = new URL(href, "http://local");
    return `${url.pathname}${url.search}`;
  } catch {
    return href.split("#")[0] || "/";
  }
}

export function titleFromPathname(pathname) {
  const path = normalizeTabHref(pathname);
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) return "Home";

  const last = segments[segments.length - 1];
  if (/^\d+$/.test(last) && segments.length > 1) {
    return humanizeSegment(segments[segments.length - 2]);
  }

  return humanizeSegment(last);
}

function humanizeSegment(segment) {
  return segment
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function tabStorageKey(organizationId) {
  return `centrix-tab-workspace:${organizationId ?? "default"}`;
}

/** @typedef {{ href: string, title: string, dirty?: boolean, lastActiveAt?: number }} TabWorkspaceTab */

/** @typedef {{ tabs: TabWorkspaceTab[], activeHref: string | null }} TabWorkspaceState */

/** @typedef {Record<string, TabWorkspaceState>} TabWorkspaceStore */

function emptyWorkspaceState() {
  return { tabs: [], activeHref: null };
}

function sanitizeTabsForWorkspace(tabs, workspaceId) {
  if (!Array.isArray(tabs) || !workspaceId) return [];
  return tabs.filter(
    (tab) =>
      tab &&
      typeof tab.href === "string" &&
      isTabWorkspaceRoute(tab.href) &&
      pathBelongsToWorkspace(tab.href, workspaceId),
  );
}

function normalizeWorkspaceState(state, workspaceId) {
  const tabs = sanitizeTabsForWorkspace(state?.tabs, workspaceId);
  const activeHref =
    state?.activeHref &&
    tabs.some((tab) => tab.href === state.activeHref)
      ? state.activeHref
      : tabs[0]?.href ?? null;

  return { tabs, activeHref };
}

function normalizeStore(raw) {
  if (!raw || typeof raw !== "object") return {};

  if (Array.isArray(raw)) {
    return { backoffice: normalizeWorkspaceState({ tabs: raw, activeHref: null }, "backoffice") };
  }

  /** @type {TabWorkspaceStore} */
  const store = {};
  for (const [workspaceId, state] of Object.entries(raw)) {
    store[workspaceId] = normalizeWorkspaceState(state, workspaceId);
  }
  return store;
}

/** @returns {TabWorkspaceStore} */
export function readTabWorkspaceStore(organizationId) {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.sessionStorage.getItem(tabStorageKey(organizationId));
    if (!raw) return {};
    return normalizeStore(JSON.parse(raw));
  } catch {
    return {};
  }
}

/** @param {TabWorkspaceStore} store */
export function writeTabWorkspaceStore(organizationId, store) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(tabStorageKey(organizationId), JSON.stringify(store));
  } catch {
    // ignore quota errors
  }
}

/** @returns {TabWorkspaceState} */
export function getWorkspaceTabState(store, workspaceId) {
  if (!workspaceId) return emptyWorkspaceState();
  return store[workspaceId] ?? emptyWorkspaceState();
}

/**
 * Resume the last active tab in a workspace when switching applications.
 * @returns {string | null}
 */
export function recallWorkspaceTabLandingPath(organizationId, workspaceId) {
  if (!workspaceId) return null;

  const { tabs, activeHref } = getWorkspaceTabState(
    readTabWorkspaceStore(organizationId),
    workspaceId,
  );

  if (activeHref && tabs.some((tab) => tab.href === activeHref)) {
    return activeHref;
  }

  if (tabs.length === 0) return null;

  const sorted = [...tabs].sort((a, b) => (b.lastActiveAt ?? 0) - (a.lastActiveAt ?? 0));
  return sorted[0]?.href ?? null;
}

export function clearAllTabWorkspaceMemory() {
  if (typeof window === "undefined") return;
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith("centrix-tab-workspace:")) keys.push(key);
    }
    keys.forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}
