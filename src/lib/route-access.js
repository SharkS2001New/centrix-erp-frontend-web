import { isNavItemVisible, navSections } from "@/lib/nav-config";
import { canViewReport, P } from "@/lib/permission-codes";
import { isOrgAdminSettingsPath, shouldHideOrgAdminFromPlatformSuperAdmin } from "@/lib/admin-scope";

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
  { prefix: "/reports", permission: P.reports.hub.view, exact: true },
];

/**
 * @param {string} pathname
 * @param {{ hasPermission: (code: string) => boolean, isModuleEnabled: (key: string) => boolean, user?: object, organization?: object, capabilities?: object, requireTillFloat?: boolean, isSuperAdmin?: () => boolean }} ctx
 */
export function canAccessRoute(pathname, ctx) {
  if (!pathname || pathname === "/login") return true;

  if (
    isOrgAdminSettingsPath(pathname) &&
    shouldHideOrgAdminFromPlatformSuperAdmin({
      organization: ctx.organization,
      isSuperAdmin: ctx.isSuperAdmin,
    })
  ) {
    return false;
  }

  for (const rule of REPORT_ROUTE_RULES) {
    const matches = rule.exact
      ? pathname === rule.prefix
      : pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`);
    if (!matches) continue;

    if (rule.prefix === "/reports" && rule.exact) {
      return ctx.hasPermission(rule.permission);
    }

    if (rule.prefix === "/reports/customer-statement") {
      return (
        ctx.hasPermission(P.reports.customer_statement.view) ||
        ctx.hasPermission(P.customers.customers.view) ||
        ctx.hasPermission(P.reports.hub.view)
      );
    }

    if (rule.prefix === "/reports/builder" || rule.prefix === "/reports/custom") {
      return ctx.hasPermission(rule.permission);
    }
  }

  const reportMatch = pathname.match(/^\/reports\/([^/]+)$/);
  if (reportMatch) {
    return canViewReport(reportMatch[1], ctx.hasPermission);
  }

  const item = NAV_ROUTE_RULES.find((rule) =>
    rule.exact ? pathname === rule.href : pathname === rule.href || pathname.startsWith(`${rule.href}/`),
  );

  if (!item) return true;

  return isNavItemVisible(item, ctx);
}
