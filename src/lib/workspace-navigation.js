import { canAccessRoute } from "@/lib/route-access";
import { pathBelongsToWorkspace, workspaceHomePath } from "@/lib/workspaces";

const STORAGE_PREFIX = "pos_erp_workspace_routes";

const SKIP_PATHS = new Set(["/choose-workspace", "/login", "/change-password"]);

function storageKey(userId, organizationId) {
  return `${STORAGE_PREFIX}:${organizationId ?? "0"}:${userId ?? "0"}`;
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
 * Resume path when re-opening a workspace — falls back to module home when unknown or inaccessible.
 */
export function recallWorkspacePath(userId, organizationId, workspaceId, capabilities, ctx = null) {
  const fallback = workspaceHomePath(workspaceId, capabilities);
  const stored = readRouteMap(userId, organizationId)[workspaceId];
  if (!stored || !pathBelongsToWorkspace(stored, workspaceId)) {
    return fallback;
  }
  if (ctx && !canAccessRoute(stored, ctx)) {
    return fallback;
  }
  return stored;
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
