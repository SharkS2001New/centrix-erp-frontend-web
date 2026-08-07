import { isNavItemVisible, navSections } from "@/lib/nav-config";
import { canAccessRoute } from "@/lib/route-access";
import {
  isTabWorkspaceEnabled,
  recallWorkspaceTabLandingPath,
} from "@/lib/tab-workspace";
import {
  filterNavSectionsForWorkspace,
  isTerminalWorkspace,
  pathBelongsToWorkspace,
  resolveAvailableWorkspaces,
  workspaceHomePath,
} from "@/lib/workspaces";

const STORAGE_PREFIX = "pos_erp_workspace_routes";

const SKIP_PATHS = new Set(["/choose-workspace", "/login", "/change-password"]);

/** Backoffice first-visit landing when overview permission is granted. */
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

/** Backoffice create-order / POS product lookups — must not unlock Backoffice alone (mirrors WorkspaceResolver). */
const BACKOFFICE_POS_SHARED_PERMISSION_CODES = new Set([
  "sales.create",
  "catalogue.view",
  "catalogue.products.view",
  "customers.view",
  "customers.customers.view",
]);

function navItemPermissionCodes(item) {
  if (item?.permissionAny?.length) return item.permissionAny.map(String);
  if (item?.permission) return [String(item.permission)];
  return [];
}

/**
 * True when the user reaches this Backoffice nav item with a real Backoffice right,
 * not only shared POS support permissions (product/customer lookups for checkout).
 */
function backofficeNavItemUnlocksWorkspace(item, ctx) {
  const codes = navItemPermissionCodes(item);
  if (!codes.length) return true;
  return codes.some(
    (code) => ctx.hasPermission(code) && !BACKOFFICE_POS_SHARED_PERMISSION_CODES.has(code),
  );
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
  const routeOpts = { workspaceId };

  for (const section of sections) {
    for (const item of section.items) {
      if (!canAccessRoute(item.href, ctx, routeOpts)) continue;
      if (workspaceId === "backoffice" && !backofficeNavItemUnlocksWorkspace(item, ctx)) {
        continue;
      }
      return item.href;
    }
  }

  return null;
}

/**
 * Workspaces the user can open — API list minus shells with no reachable route.
 * Terminal shells (External POS / Hotel POS) have no sidebar nav; check home path instead.
 * @param {object} ctx
 * @param {object} capabilities
 */
export function resolveAccessibleWorkspaces(ctx, capabilities) {
  return resolveAvailableWorkspaces(ctx, capabilities, (workspaceId) => {
    if (isTerminalWorkspace(workspaceId)) {
      const home = workspaceHomePath(workspaceId, capabilities);
      return Boolean(ctx && home && canAccessRoute(home, ctx, { workspaceId }));
    }
    return Boolean(firstAccessibleRouteInWorkspace(workspaceId, capabilities, ctx));
  });
}

/**
 * @param {object} ctx
 * @param {object} capabilities
 */
export function resolvePostLoginPath(ctx, capabilities) {
  if (ctx?.platformShell) {
    return "/platform";
  }

  const workspaces = resolveAccessibleWorkspaces(ctx, capabilities);
  if (workspaces.length === 0) {
    return "/profile";
  }
  if (workspaces.length === 1) {
    return workspaces[0].home_path;
  }
  return "/choose-workspace";
}

/** True when user must pick a workspace before using the app shell. */
export function needsWorkspaceSelection(capabilities, storedWorkspaceId, ctx) {
  if (ctx?.platformShell) return false;
  const workspaces = resolveAccessibleWorkspaces(ctx, capabilities);
  if (workspaces.length <= 1) return false;
  return !storedWorkspaceId || !workspaces.some((w) => w.id === storedWorkspaceId);
}

export function defaultWorkspaceId(capabilities, ctx) {
  const workspaces = resolveAccessibleWorkspaces(ctx, capabilities);
  return workspaces[0]?.id ?? null;
}

function resolveBackofficeLandingPath(capabilities, ctx) {
  const routeOpts = { workspaceId: "backoffice" };
  if (ctx && canAccessRoute(BACKOFFICE_DEFAULT_LANDING_PATH, ctx, routeOpts)) {
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

  const routeOpts = { workspaceId };
  const home = workspaceHomePath(workspaceId, capabilities);
  if (ctx && canAccessRoute(home, ctx, routeOpts)) {
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
 * Business summary (`/dashboard`) is only the first-visit fallback for Backoffice (when permitted),
 * not forced on every module switch.
 */
export function recallWorkspaceLandingPath(
  userId,
  organizationId,
  workspaceId,
  capabilities,
  ctx = null,
) {
  if (isTabWorkspaceEnabled(capabilities)) {
    const tabPath = recallWorkspaceTabLandingPath(organizationId, workspaceId);
    if (tabPath && pathBelongsToWorkspace(tabPath, workspaceId)) {
      if (!ctx || canAccessRoute(tabPath, ctx, { workspaceId })) {
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
  if (ctx && !canAccessRoute(stored, ctx, { workspaceId })) {
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
