import { describe, expect, it } from "vitest";
import { isNavItemVisible, navSections } from "@/lib/nav-config";
import { P } from "@/lib/permission-codes";
import { resolveDashboardAnalyticsScope } from "@/lib/workspace-reports";

const dashboardSection = navSections.find((section) => section.id === "dashboard");
const businessSummary = dashboardSection?.items.find((item) => item.href === "/dashboard");
const salesAnalytics = dashboardSection?.items.find((item) => item.href === "/sales");

function makeCtx(permissionCodes) {
  const granted = new Set(permissionCodes);
  const capabilities = {
    modules: {
      sales: true,
      "sales.dashboard": true,
      "sales.backend": true,
      inventory: true,
      "inventory.dashboard": true,
    },
    module_settings: {},
    permissions: Object.fromEntries([...granted].map((code) => [code, true])),
    assigned_permissions: Object.fromEntries([...granted].map((code) => [code, true])),
  };
  return {
    isModuleEnabled: (key) => Boolean(capabilities.modules?.[key]),
    hasPermission: (code) => granted.has(code),
    hasNavPermission: (code) => granted.has(code),
    isSuperAdmin: () => false,
    requireTillFloat: false,
    user: { login_channels: ["backoffice"], is_admin: false },
    organization: { company_code: "DEMO" },
    capabilities,
  };
}

describe("dashboard analytics permissions stay independent", () => {
  it("shows Business summary without Sales analytics when only overview is granted", () => {
    const ctx = makeCtx([P.dashboard.overview.view]);
    expect(isNavItemVisible(businessSummary, ctx)).toBe(true);
    expect(isNavItemVisible(salesAnalytics, ctx)).toBe(false);
  });

  it("shows Sales analytics without Business summary when only sales analytics is granted", () => {
    const ctx = makeCtx([P.dashboard.sales.view]);
    expect(isNavItemVisible(businessSummary, ctx)).toBe(false);
    expect(isNavItemVisible(salesAnalytics, ctx)).toBe(true);
  });

  it("strips sales KPIs/charts from Business summary without dashboard.sales.view", () => {
    const hasPermission = (code) => code === P.dashboard.overview.view || code === P.reports.hub.view;
    const scope = resolveDashboardAnalyticsScope("backoffice", hasPermission);
    expect(scope.kpis).not.toContain("total_sales");
    expect(scope.kpis).not.toContain("gross_profit");
    expect(scope.charts).toEqual([]);
  });

  it("keeps sales KPIs on Business summary when dashboard.sales.view is granted", () => {
    const hasPermission = (code) =>
      code === P.dashboard.overview.view ||
      code === P.dashboard.sales.view ||
      code === P.reports.hub.view;
    const scope = resolveDashboardAnalyticsScope("backoffice", hasPermission);
    expect(scope.kpis).toEqual(expect.arrayContaining(["total_sales", "gross_profit"]));
    expect(scope.charts).toEqual(
      expect.arrayContaining(["sales_trend", "top_products", "sales_by_channel"]),
    );
  });
});
