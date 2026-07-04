import { shouldHideOrgAdminFromPlatformSuperAdmin } from "@/lib/admin-scope";
import { isNavItemVisible, navSections } from "@/lib/nav-config";
import { P } from "@/lib/permission-codes";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { canAccessRoute } from "@/lib/route-access";
import { firstAccessibleRouteInWorkspace } from "@/lib/workspace-navigation";
import {
  defaultWorkspaceId,
  resolvePostLoginPath,
  workspaceDefinition,
  workspaceHomePath,
} from "@/lib/workspaces";
import { isTillFloatWorkflowEnabled } from "@/lib/sales-settings";

/** Whether till-management nav and routes are enabled for this tenant. */
export function resolveTillFloatNavFlag(capabilities) {
  return isTillFloatWorkflowEnabled(capabilities?.module_settings);
}

/** Routes platform super admins may use (tenant ERP is hidden). */
export const PLATFORM_SHELL_PREFIXES = ["/platform", "/profile"];

export function isPlatformShellRoute(pathname) {
  if (!pathname) return false;
  return PLATFORM_SHELL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function isPlatformShellUser({ user, organization, capabilities, isSuperAdmin }) {
  const superAdmin =
    typeof isSuperAdmin === "function"
      ? isSuperAdmin()
      : Boolean(user?.is_super_admin || capabilities?.is_super_admin);
  return shouldHideOrgAdminFromPlatformSuperAdmin({ organization, isSuperAdmin: () => superAdmin });
}

/**
 * Single source of truth for UI permission checks.
 * Org admins bypass permission checks; module enablement still gates nav and routes.
 * Other users rely on the role/override permission map from the API.
 */
export function resolveHasPermission({ user, organization, capabilities, code, isSuperAdmin }) {
  if (!code) return true;

  if (user?.is_admin || capabilities?.is_admin) {
    return true;
  }

  if (
    isPlatformShellUser({
      user,
      organization,
      capabilities,
      isSuperAdmin,
    })
  ) {
    return false;
  }

  return capabilities?.permissions?.[code] ?? false;
}

export function buildAccessContext({
  user,
  organization,
  capabilities,
  requireTillFloat,
  isSuperAdmin,
}) {
  const superAdminFn =
    typeof isSuperAdmin === "function"
      ? isSuperAdmin
      : () => Boolean(user?.is_super_admin || capabilities?.is_super_admin);

  const hasPermission = (code) =>
    resolveHasPermission({
      user,
      organization,
      capabilities,
      code,
      isSuperAdmin: superAdminFn,
    });

  const isModuleEnabled = (key) => capabilities?.modules?.[key] ?? false;

  return {
    user,
    organization,
    capabilities,
    requireTillFloat: Boolean(requireTillFloat),
    isSuperAdmin: superAdminFn,
    hasPermission,
    isModuleEnabled,
    platformShell: isPlatformShellUser({
      user,
      organization,
      capabilities,
      isSuperAdmin: superAdminFn,
    }),
  };
}

/** First route the signed-in user should land on after login or when blocked. */
export function resolveHomePath(ctx) {
  if (isPlatformShellUser(ctx)) {
    return "/platform";
  }

  const capabilities = ctx.capabilities;
  const stored = getStoredWorkspace();

  const workspaceHome = stored
    ? workspaceDefinition(stored, capabilities)?.home_path
    : null;
  if (workspaceHome && canAccessRoute(workspaceHome, ctx)) {
    return workspaceHome;
  }

  const postLogin = resolvePostLoginPath(ctx, ctx.capabilities);
  if (postLogin === "/choose-workspace" && !stored) {
    return postLogin;
  }
  if (postLogin !== "/choose-workspace" && canAccessRoute(postLogin, ctx)) {
    return postLogin;
  }

  const workspaceId = stored ?? defaultWorkspaceId(ctx.capabilities, ctx);
  if (workspaceId) {
    const home = workspaceHomePath(workspaceId, ctx.capabilities);
    if (canAccessRoute(home, ctx)) {
      return home;
    }

    const workspaceRoute = firstAccessibleRouteInWorkspace(workspaceId, ctx.capabilities, ctx);
    if (workspaceRoute) {
      return workspaceRoute;
    }
  }

  if (
    isNavItemVisible(
      { href: "/dashboard", permission: P.dashboard.overview.view, exact: true },
      ctx,
    )
  ) {
    return "/dashboard";
  }

  for (const section of navSections) {
    if (section.superAdminOnly && !ctx.isSuperAdmin?.()) continue;

    for (const item of section.items) {
      if (isNavItemVisible(item, ctx)) {
        return item.href;
      }
    }
  }

  return "/profile";
}

export function canPerformAction({ permission, module, create, edit, delete: canDelete }, ctx) {
  if (module && !ctx.isModuleEnabled(module)) return false;
  if (permission && !ctx.hasPermission(permission)) return false;
  if (create && !ctx.hasPermission(create)) return false;
  if (edit && !ctx.hasPermission(edit)) return false;
  if (canDelete && !ctx.hasPermission(canDelete)) return false;
  return true;
}
