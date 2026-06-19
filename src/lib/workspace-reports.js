import { reportModuleForSlug } from "@/lib/module-registry";

/** Report module keys owned by each product workspace. */
export const WORKSPACE_REPORT_MODULES = {
  backoffice: ["sales.reports", "inventory.reports", "customers_suppliers.reports"],
  accounting: ["accounting.reports"],
  hr: ["hr_payroll.reports"],
};

/** Analytics dashboard routes per workspace (sidebar Dashboard section). */
export const WORKSPACE_ANALYTICS_HREFS = {
  backoffice: ["/sales", "/inventory", "/fulfillment"],
  accounting: ["/accounting"],
  hr: ["/hr"],
};

/** KPI / chart scopes for embedded analytics sections. */
export const WORKSPACE_DASHBOARD_SCOPES = {
  backoffice: {
    kpis: ["total_sales", "gross_profit", "inventory_value"],
    charts: ["sales_trend", "top_products", "sales_by_channel"],
  },
  sales: {
    kpis: ["total_sales", "gross_profit"],
    charts: ["sales_trend", "top_products", "sales_by_channel"],
  },
  accounting: {
    kpis: ["receivables"],
    charts: [],
  },
  hr: {
    kpis: [],
    charts: [],
  },
};

export const WORKSPACE_REPORTS_LABEL = {
  backoffice: "Sales & operations reports",
  accounting: "Accounting reports",
  hr: "HR & payroll reports",
};

/** Report builder data source scope per workspace (matches API config). */
export const WORKSPACE_BUILDER_LABEL = {
  backoffice: "Sales, inventory & purchasing data",
  accounting: "Accounting data",
  hr: "HR & payroll data",
  admin: "All modules",
};

/** @param {import("@/lib/nav-config").NavItem} item */
export function reportModuleForNavItem(item) {
  if (item.module) return item.module;
  if (item.reportKey) return reportModuleForSlug(item.reportKey);
  if (item.href?.startsWith("/reports/")) {
    const slug = item.href.replace(/^\/reports\//, "").split("/")[0];
    return reportModuleForSlug(slug);
  }
  return null;
}

/** @param {string} slug */
export function reportSlugBelongsToWorkspace(slug, workspaceId) {
  const mod = reportModuleForSlug(slug);
  if (!mod) return workspaceId === "backoffice";
  return (WORKSPACE_REPORT_MODULES[workspaceId] ?? []).includes(mod);
}

/** @param {import("@/lib/nav-config").NavItem} item */
export function reportNavItemBelongsToWorkspace(item, workspaceId) {
  const modules = WORKSPACE_REPORT_MODULES[workspaceId];
  if (!modules?.length) return false;

  if (item.href === "/reports" || item.href === "/reports/builder") {
    return true;
  }

  const mod = reportModuleForNavItem(item);
  if (!mod) return false;
  return modules.includes(mod);
}

/** @param {string} workspaceId @param {Record<string, boolean> | undefined} enabledModules */
export function workspaceHasEnabledReports(workspaceId, enabledModules) {
  return (WORKSPACE_REPORT_MODULES[workspaceId] ?? []).some((key) => enabledModules?.[key]);
}

/**
 * Filter hub categories to reports in the active workspace.
 * @param {ReturnType<import("@/lib/reports/catalog-ui").buildReportCategories>} categories
 */
export function filterReportCategoriesForWorkspace(categories, workspaceId) {
  const modules = new Set(WORKSPACE_REPORT_MODULES[workspaceId] ?? []);
  if (!modules.size) return [];

  return categories
    .map((cat) => ({
      ...cat,
      reports: cat.reports.filter((r) => {
        const mod = reportModuleForSlug(r.key);
        return mod ? modules.has(mod) : workspaceId === "backoffice";
      }),
    }))
    .filter((cat) => cat.reports.length > 0)
    .map((cat) => ({ ...cat, count: cat.reports.length }));
}
