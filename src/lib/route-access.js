import { isNavItemVisible, navSections } from "@/lib/nav-config";
import { canViewReport, P } from "@/lib/permission-codes";
import {
  canViewAnySalesOrderQueue,
  canViewOrderQueue,
} from "@/lib/order-queue-permissions";
import {
  canAccessTenantOrganizationSettings,
  isAdministrationModuleEnabled,
  isOrgAdminSettingsPath,
  shouldHideOrgAdminFromPlatformSuperAdmin,
} from "@/lib/admin-scope";
import { isPlatformShellRoute, isPlatformShellUser } from "@/lib/platform-shell-access";
import { isReportModuleEnabled } from "@/lib/backoffice-finance-reports";
import { anyReportsModuleEnabled } from "@/lib/module-registry";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { defaultWorkspaceId, pathBelongsToWorkspace } from "@/lib/workspaces";
import { canAccessAccountingRoute } from "@/lib/finance-settings";
import { isCashAdvanceDeductionsEnabled } from "@/lib/hr-settings";
import { isLegacyArchiveEnabled } from "@/lib/legacy-archive-settings";
import { reportVisibleForCatalog } from "@/lib/reports/catalog-ui";

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

let navRouteRulesCache = null;

function getNavRouteRules() {
  if (!navRouteRulesCache) {
    navRouteRulesCache = flattenNavItems().filter((item) => item.href);
  }
  return navRouteRulesCache;
}

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
    prefix: "/hotel-bar-pos",
    permission: P.hotel_bar_pos.terminal.view,
  },
  {
    prefix: "/sales/pos",
    // Backoffice create order — cashiers use External POS (/pos), not this route.
    permission: P.sales.orders.create,
  },
  {
    prefix: "/sales/end-of-day",
    permission: P.pos.end_of_day.view,
    altPermissions: [P.reports.hub.view],
  },
  {
    prefix: "/sales/payments-breakdown",
    permission: P.pos.payments_breakdown.view,
    altPermissions: [
      P.pos.end_of_day.view,
      P.pos.till_management.view,
    ],
  },
];

/** Hospitality backoffice pages that need explicit route rules (not only nav flatten). */
export const HOSPITALITY_ROUTE_RULES = [
  {
    prefix: "/hospitality/payments-breakdown",
    permission: P.hospitality.payments_breakdown.view,
    altPermissions: [P.hospitality.reports.view],
  },
  {
    prefix: "/hospitality/orders",
    permission: P.hospitality.orders.view,
    altPermissions: [
      P.hospitality.dashboard.view,
      P.hospitality.reports.view,
      P.hotel_bar_pos.checks.view,
      P.hospitality.settings.view,
    ],
  },
];

/** Suppliers list nav is exact — child paths need explicit rules. */
function canAccessSupplierSubroute(pathname, ctx) {
  if (!pathname.startsWith("/suppliers/")) return null;
  if (!ctx.isModuleEnabled("customers_suppliers")) return false;

  if (pathname === "/suppliers/new") {
    return ctx.hasPermission(P.purchasing.suppliers.create);
  }

  if (/^\/suppliers\/[^/]+\/edit$/.test(pathname)) {
    return ctx.hasPermission(P.purchasing.suppliers.edit);
  }

  if (/^\/suppliers\/[^/]+$/.test(pathname)) {
    return ctx.hasPermission(P.purchasing.suppliers.view);
  }

  return null;
}

/**
 * @param {string} pathname
 * @param {{ hasPermission: (code: string) => boolean, isModuleEnabled: (key: string) => boolean, user?: object, organization?: object, capabilities?: object, requireTillFloat?: boolean, isSuperAdmin?: () => boolean }} ctx
 * @param {{ workspaceId?: string | null }} [options]
 *        Optional target workspace for access checks during module switch
 *        (before setStoredWorkspace updates). Defaults to the stored workspace.
 */
export function canAccessRoute(pathname, ctx, options = {}) {
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

  if (pathname === "/admin/themes" || pathname.startsWith("/admin/themes/")) {
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

  const workspaceId =
    options.workspaceId !== undefined
      ? options.workspaceId
      : (getStoredWorkspace() ?? defaultWorkspaceId(ctx.capabilities, ctx));
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

  const salesOrderQueueMatch = pathname.match(/^\/sales\/orders\/queues\/([^/]+)$/);
  if (salesOrderQueueMatch) {
    const check =
      typeof ctx.hasNavPermission === "function" ? ctx.hasNavPermission : ctx.hasPermission;
    return canViewOrderQueue(salesOrderQueueMatch[1], check);
  }

  if (pathname === "/sales/orders") {
    const check =
      typeof ctx.hasNavPermission === "function" ? ctx.hasNavPermission : ctx.hasPermission;
    return canViewOrderQueue("all", check);
  }

  if (/^\/sales\/orders\/[^/]+$/.test(pathname)) {
    const check =
      typeof ctx.hasNavPermission === "function" ? ctx.hasNavPermission : ctx.hasPermission;
    return canViewAnySalesOrderQueue(check);
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

  for (const rule of HOSPITALITY_ROUTE_RULES) {
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
    if (!reportVisibleForCatalog(slug, ctx.capabilities)) {
      return false;
    }
    if (!isReportModuleEnabled(slug, ctx.isModuleEnabled)) {
      return false;
    }
    return canViewReport(slug, ctx.hasPermission);
  }

  const supplierSubroute = canAccessSupplierSubroute(pathname, ctx);
  if (supplierSubroute !== null) {
    return supplierSubroute;
  }

  const item = getNavRouteRules().find((rule) =>
    rule.exact ? pathname === rule.href : pathname === rule.href || pathname.startsWith(`${rule.href}/`),
  );

  if (!item) {
    if (pathname === "/profile" || pathname.startsWith("/profile/")) {
      return true;
    }

    if (pathname === "/notifications" || pathname.startsWith("/notifications/")) {
      return true;
    }

    const strictModulePrefixes = [
      "/sales/",
      "/inventory/",
      "/fulfillment/",
      "/hr/",
      "/accounting/",
      "/lpo/",
      "/customers/",
      "/products/",
      "/suppliers/",
      "/purchasing/",
    ];

    if (strictModulePrefixes.some((prefix) => pathname.startsWith(prefix))) {
      return false;
    }

    return true;
  }

  return isNavItemVisible(item, ctx);
}
