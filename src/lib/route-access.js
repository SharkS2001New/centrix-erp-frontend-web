import { isNavItemVisible, navSections } from "@/lib/nav-config";
import { canViewReport, P } from "@/lib/permission-codes";
import {
  canAccessTenantOrganizationSettings,
  isAdministrationModuleEnabled,
  isOrgAdminSettingsPath,
  shouldHideOrgAdminFromPlatformSuperAdmin,
} from "@/lib/admin-scope";
import { isPlatformShellRoute, isPlatformShellUser } from "@/lib/access-control";
import { isReportModuleEnabled } from "@/lib/backoffice-finance-reports";
import { anyReportsModuleEnabled } from "@/lib/module-registry";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { defaultWorkspaceId, pathBelongsToWorkspace } from "@/lib/workspaces";
import { canAccessAccountingRoute } from "@/lib/finance-settings";
import { isCashAdvanceDeductionsEnabled } from "@/lib/hr-settings";
import { isLegacyArchiveEnabled } from "@/lib/legacy-archive-settings";

const LEGACY_ARCHIVE_ROUTE_PREFIXES = [
  "/sales/legacy-orders",
  "/sales/legacy-returns",
  "/reports/legacy-archive",
];

function flattenNavItems() {
  const items = [];
  for (const section of navSections) {
    for (const item of section.items) {
      items.push({
        ...item,
        module: item.module ?? section.module ?? null,
      });
    }
  }
  return items.sort((a, b) => b.href.length - a.href.length);
}

const NAV_ROUTE_RULES = flattenNavItems().filter((item) => item.href);

const REPORT_ROUTE_RULES = [
  { prefix: "/reports/builder", permission: P.reports.builder.view },
  { prefix: "/reports/custom", permission: P.reports.builder.view },
  { prefix: "/reports/customer-statement", permission: P.reports.customer_statement.view },
  { prefix: "/reports/supplier-statement", permission: P.purchasing.suppliers.view },
  { prefix: "/reports", permission: P.reports.hub.view, exact: true },
];

const POS_ROUTE_RULES = [
  { prefix: "/pos", permission: P.pos.terminal.view },
  {
    prefix: "/sales/pos",
    permission: P.pos.checkout.create,
    altPermissions: [P.sales.orders.create],
  },
  {
    prefix: "/sales/end-of-day",
    permission: P.pos.end_of_day.view,
    altPermissions: [P.reports.hub.view],
  },
];

/**
 * @param {string} pathname
 * @param {{ hasPermission: (code: string) => boolean, isModuleEnabled: (key: string) => boolean, user?: object, organization?: object, capabilities?: object, requireTillFloat?: boolean, isSuperAdmin?: () => boolean }} ctx
 */
export function canAccessRoute(pathname, ctx) {
  if (!pathname || pathname === "/login") return true;

  if (isPlatformShellUser(ctx)) {
    return isPlatformShellRoute(pathname);
  }

  if (pathname === "/admin/settings" || pathname.startsWith("/admin/settings/")) {
    return canAccessTenantOrganizationSettings({
      organization: ctx.organization,
      isSuperAdmin: ctx.isSuperAdmin,
      hasPermission: ctx.hasPermission,
      user: ctx.user,
      capabilities: ctx.capabilities,
    });
  }

  if (
    (pathname.startsWith("/admin") || isOrgAdminSettingsPath(pathname)) &&
    !isAdministrationModuleEnabled(ctx.capabilities)
  ) {
    return false;
  }

  const workspaceId = getStoredWorkspace() ?? defaultWorkspaceId(ctx.capabilities, ctx);
  if (workspaceId && !pathBelongsToWorkspace(pathname, workspaceId)) {
    return false;
  }

  if (!canAccessAccountingRoute(pathname, ctx.capabilities?.module_settings)) {
    return false;
  }

  if (
    (pathname === "/hr/cash-advances" || pathname.startsWith("/hr/cash-advances/")) &&
    !isCashAdvanceDeductionsEnabled(ctx.capabilities?.module_settings)
  ) {
    return false;
  }

  if (
    LEGACY_ARCHIVE_ROUTE_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) &&
    !isLegacyArchiveEnabled(ctx.capabilities)
  ) {
    return false;
  }

  if (
    isOrgAdminSettingsPath(pathname) &&
    shouldHideOrgAdminFromPlatformSuperAdmin({
      organization: ctx.organization,
      isSuperAdmin: ctx.isSuperAdmin,
    })
  ) {
    return false;
  }

  for (const rule of POS_ROUTE_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`)) {
      if (ctx.hasPermission(rule.permission)) return true;
      if (rule.altPermissions?.some((code) => ctx.hasPermission(code))) return true;
      return false;
    }
  }

  for (const rule of REPORT_ROUTE_RULES) {
    const matches = rule.exact
      ? pathname === rule.prefix
      : pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`);
    if (!matches) continue;

    if (rule.prefix === "/reports" && rule.exact) {
      return ctx.hasPermission(rule.permission) && anyReportsModuleEnabled(ctx.capabilities?.modules);
    }

    if (rule.prefix === "/reports/customer-statement") {
      return (
        ctx.hasPermission(P.reports.customer_statement.view) ||
        ctx.hasPermission(P.customers.customers.view) ||
        ctx.hasPermission(P.reports.hub.view)
      );
    }

    if (rule.prefix === "/reports/supplier-statement") {
      return (
        ctx.hasPermission(P.purchasing.suppliers.view) ||
        ctx.hasPermission(P.reports.hub.view)
      );
    }

    if (rule.prefix === "/reports/builder" || rule.prefix === "/reports/custom") {
      return ctx.hasPermission(rule.permission);
    }
  }

  const reportMatch = pathname.match(/^\/reports\/([^/]+)$/);
  if (reportMatch) {
    const slug = reportMatch[1];
    if (slug === "legacy-archive" && !isLegacyArchiveEnabled(ctx.capabilities)) {
      return false;
    }
    if (!isReportModuleEnabled(slug, ctx.isModuleEnabled)) {
      return false;
    }
    return canViewReport(slug, ctx.hasPermission);
  }

  const item = NAV_ROUTE_RULES.find((rule) =>
    rule.exact ? pathname === rule.href : pathname === rule.href || pathname.startsWith(`${rule.href}/`),
  );

  if (!item) return true;

  return isNavItemVisible(item, ctx);
}
