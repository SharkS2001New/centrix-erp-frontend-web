import { isNavItemVisible, navSections } from "@/lib/nav-config";
import { canAccessRoute } from "@/lib/route-access";
import {
  isTabWorkspaceEnabled,
  recallWorkspaceTabLandingPath,
} from "@/lib/tab-workspace";
import {
  filterNavSectionsForWorkspace,
  pathBelongsToWorkspace,
  workspaceHomePath,
} from "@/lib/workspaces";

const STORAGE_PREFIX = "pos_erp_workspace_routes";

const SKIP_PATHS = new Set(["/choose-workspace", "/login", "/change-password"]);

/** Backoffice opens on Business summary when the user can view it. */
export const BACKOFFICE_DEFAULT_LANDING_PATH = "/dashboard";

function storageKey(userId, organizationId) {
  return `${STORAGE_PREFIX}:${String(organizationId ?? "0")}:${String(userId ?? "0")}`;
}

/** @returns {Record<string, string>} */
function readRouteMap(userId, organizationId) {
  if (typeof window === "undefined") return {};
  try {
    const raw = sessionStorage.getItem(storageKey(userId, organizationId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeRouteMap(userId, organizationId, map) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(userId, organizationId), JSON.stringify(map));
  } catch {
    /* ignore quota / private mode */
  }
}

export function shouldRememberWorkspacePath(pathname, workspaceId) {
  if (!pathname || !workspaceId) return false;
  if (SKIP_PATHS.has(pathname)) return false;
  if (pathname.startsWith("/change-password")) return false;
  return pathBelongsToWorkspace(pathname, workspaceId);
}

/**
 * Remember the last in-module route for the active workspace (session-scoped).
 */
export function rememberWorkspacePath(userId, organizationId, workspaceId, pathname) {
  if (!shouldRememberWorkspacePath(pathname, workspaceId)) return;
  const map = readRouteMap(userId, organizationId);
  if (map[workspaceId] === pathname) return;
  map[workspaceId] = pathname;
  writeRouteMap(userId, organizationId, map);
}

/**
 * Persist the route the user is leaving before switching applications.
 */
export function persistWorkspaceRouteBeforeSwitch(
  userId,
  organizationId,
  workspaceId,
  pathname,
) {
  if (!workspaceId || !pathname) return;
  rememberWorkspacePath(userId, organizationId, workspaceId, pathname);
}

/**
 * First route in the workspace sidebar the user can open (e.g. dispatch when overview is off).
 * @param {string} workspaceId
 * @param {object} capabilities
 * @param {object | null} ctx access context from buildAccessContext
 */
export function firstAccessibleRouteInWorkspace(workspaceId, capabilities, ctx) {
  if (!workspaceId || !ctx) return null;

  const navContext = { capabilities, ...ctx };
  const sections = filterNavSectionsForWorkspace(
    navSections,
    workspaceId,
    navContext,
    isNavItemVisible,
  );

  for (const section of sections) {
    for (const item of section.items) {
      if (canAccessRoute(item.href, ctx)) {
        return item.href;
      }
    }
  }

  return null;
}

function resolveBackofficeLandingPath(capabilities, ctx) {
  if (ctx && canAccessRoute(BACKOFFICE_DEFAULT_LANDING_PATH, ctx)) {
    return BACKOFFICE_DEFAULT_LANDING_PATH;
  }

  const firstAccessible = firstAccessibleRouteInWorkspace("backoffice", capabilities, ctx);
  if (firstAccessible) {
    return firstAccessible;
  }

  return workspaceHomePath("backoffice", capabilities);
}

function resolveWorkspaceFallbackPath(workspaceId, capabilities, ctx) {
  if (workspaceId === "backoffice") {
    return resolveBackofficeLandingPath(capabilities, ctx);
  }

  const home = workspaceHomePath(workspaceId, capabilities);
  if (ctx && canAccessRoute(home, ctx)) {
    return home;
  }

  const firstAccessible = firstAccessibleRouteInWorkspace(workspaceId, capabilities, ctx);
  if (firstAccessible) {
    return firstAccessible;
  }

  return home;
}

/**
 * Resume path when re-opening a workspace — prefers tab workspace state, then last route, then home.
 */
export function recallWorkspaceLandingPath(
  userId,
  organizationId,
  workspaceId,
  capabilities,
  ctx = null,
) {
  if (workspaceId === "backoffice") {
    return resolveBackofficeLandingPath(capabilities, ctx);
  }

  if (isTabWorkspaceEnabled(capabilities)) {
    const tabPath = recallWorkspaceTabLandingPath(organizationId, workspaceId);
    if (tabPath && pathBelongsToWorkspace(tabPath, workspaceId)) {
      if (!ctx || canAccessRoute(tabPath, ctx)) {
        return tabPath;
      }
    }
  }

  return recallWorkspacePath(userId, organizationId, workspaceId, capabilities, ctx);
}

/**
 * Resume path when re-opening a workspace — falls back to module home when unknown or inaccessible.
 */
export function recallWorkspacePath(userId, organizationId, workspaceId, capabilities, ctx = null) {
  const fallback = resolveWorkspaceFallbackPath(workspaceId, capabilities, ctx);
  if (!workspaceId) return fallback;

  const stored = readRouteMap(userId, organizationId)[workspaceId];
  if (!stored || !pathBelongsToWorkspace(stored, workspaceId)) {
    return fallback;
  }
  if (ctx && !canAccessRoute(stored, ctx)) {
    return fallback;
  }
  return stored;
}

/** Landing route after a workspace switch or when the URL belongs to another module. */
export function workspaceLandingPath(userId, organizationId, workspaceId, capabilities, ctx = null) {
  if (!workspaceId) {
    return workspaceHomePath(workspaceId, capabilities);
  }

  return resolveWorkspaceFallbackPath(workspaceId, capabilities, ctx);
}

export function clearWorkspaceRouteMemory(userId, organizationId) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(storageKey(userId, organizationId));
  } catch {
    /* ignore */
  }
}

/** Clear all remembered workspace routes (e.g. on logout). */
export function clearAllWorkspaceRouteMemory() {
  if (typeof window === "undefined") return;
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(STORAGE_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => sessionStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}
