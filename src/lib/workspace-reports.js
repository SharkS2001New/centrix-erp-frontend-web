import { reportModuleForSlug } from "@/lib/module-registry";
import {
  BACKOFFICE_FINANCE_REPORT_MODULES,
  isBackofficeFinanceReport,
  isReportModuleEnabled,
  isStatementReportSlug,
  statementReportBelongsToWorkspace,
} from "@/lib/backoffice-finance-reports";

/** Report module keys owned by each product workspace. */
export const WORKSPACE_REPORT_MODULES = {
  backoffice: ["sales.reports", "inventory.reports", "customers_suppliers.reports"],
  accounting: ["accounting.reports"],
  hr: ["hr_payroll.reports"],
  distribution: ["distribution.reports"],
  hospitality_backoffice: [
    "hospitality.reports",
    "inventory.reports",
    "customers_suppliers.reports",
  ],
};

/** All product workspaces expose /reports as Report overview. */
export const WORKSPACE_HIDE_REPORTS_HUB = new Set([]);

/** Analytics dashboard routes per workspace (sidebar Dashboard section). */
export const WORKSPACE_ANALYTICS_HREFS = {
  backoffice: ["/sales", "/inventory"],
  accounting: ["/accounting"],
  hr: ["/hr"],
  distribution: ["/fulfillment"],
  hospitality_backoffice: ["/hospitality", "/inventory"],
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
  distribution: {
    kpis: [],
    charts: [],
  },
};

const SALES_ANALYTICS_KPIS = new Set(["total_sales", "gross_profit"]);
const SALES_ANALYTICS_CHARTS = new Set(["sales_trend", "top_products", "sales_by_channel"]);
const INVENTORY_ANALYTICS_KPIS = new Set(["inventory_value"]);

/**
 * Business summary (backoffice scope) must not surface Sales / Inventory analytics
 * unless those permissions are granted — each dashboard link is independent.
 *
 * @param {string} workspaceScope
 * @param {(code: string) => boolean} [hasPermission]
 */
export function resolveDashboardAnalyticsScope(workspaceScope, hasPermission) {
  const base = WORKSPACE_DASHBOARD_SCOPES[workspaceScope] ?? WORKSPACE_DASHBOARD_SCOPES.backoffice;
  if (workspaceScope !== "backoffice" || typeof hasPermission !== "function") {
    return base;
  }

  const canSales = hasPermission("dashboard.sales.view");
  const canInventory = hasPermission("dashboard.inventory.view");

  return {
    kpis: base.kpis.filter((id) => {
      if (SALES_ANALYTICS_KPIS.has(id)) return canSales;
      if (INVENTORY_ANALYTICS_KPIS.has(id)) return canInventory;
      return true;
    }),
    charts: base.charts.filter((id) => {
      if (SALES_ANALYTICS_CHARTS.has(id)) return canSales;
      return true;
    }),
  };
}

export const WORKSPACE_REPORTS_LABEL = {
  backoffice: "Sales, finance & operations reports",
  accounting: "Accounting reports",
  hr: "Leave, payroll, and workforce reporting",
  distribution: "Route sales and logistics reporting",
  hospitality_backoffice: "Occupancy, food & drink, and hotel operations reporting",
};

export const WORKSPACE_REPORT_OVERVIEW_LABEL = "Report overview";

/** Report builder data source scope per workspace (matches API config). */
export const WORKSPACE_BUILDER_LABEL = {
  backoffice: "Sales, inventory, purchasing & POS data",
  accounting: "Accounting and payments data",
  hr: "Workforce and payroll data",
  distribution: "Sales orders and logistics data",
  hospitality_backoffice: "Hospitality checks, folios, rooms & inventory",
  admin: "All modules",
};

/** Example NL prompts for Report builder — must stay within that workspace’s modules. */
export const WORKSPACE_BUILDER_EXAMPLE_PROMPTS = {
  backoffice: [
    "Sales by product this month",
    "Purchases by supplier last 7 days",
    "Stock value by branch",
  ],
  accounting: [
    "Expenses by account this month",
    "Payments received last 7 days",
    "Trial balance by account",
  ],
  hr: [
    "Headcount by department",
    "Payroll totals this period",
    "Attendance by branch last 7 days",
  ],
  distribution: [
    "Orders by route this week",
    "Deliveries by driver",
    "Sales by product this month",
  ],
  hospitality_backoffice: [
    "Occupancy by room type",
    "Food & drink sales this week",
    "Purchases by supplier last 7 days",
  ],
  admin: [
    "Sales by product this month",
    "Payroll totals this period",
    "Expenses by account this month",
  ],
};

/** Short hint under “Start with a data source” — module-scoped, never cross-workspace. */
export const WORKSPACE_BUILDER_SOURCE_HINT = {
  backoffice: "Choose sales, inventory, purchasing, or POS sources for this workspace.",
  accounting: "Choose accounting or payments sources for this workspace.",
  hr: "Choose workforce and payroll sources for this workspace (employees, attendance, leave, payroll).",
  distribution: "Choose sales and logistics sources for this workspace.",
  hospitality_backoffice: "Choose hospitality, inventory, or purchasing sources for this workspace.",
  admin: "Choose a data source from the modules available to admin.",
};

/**
 * @-mention entity types allowed in Report builder per workspace.
 * Keep these aligned with that workspace’s data sources — do not mix modules.
 * @type {Record<string, Array<'product'|'supplier'|'customer'|'employee'|'user'|'branch'>>}
 */
export const WORKSPACE_BUILDER_MENTION_TYPES = {
  backoffice: ["product", "supplier", "customer", "branch", "user"],
  accounting: ["customer", "supplier", "branch", "user"],
  hr: ["employee", "branch", "user"],
  distribution: ["product", "customer", "branch", "user"],
  hospitality_backoffice: ["product", "supplier", "customer", "branch", "user"],
  admin: ["product", "supplier", "customer", "employee", "user", "branch"],
};

export function workspaceBuilderExamplePrompts(workspaceId) {
  return (
    WORKSPACE_BUILDER_EXAMPLE_PROMPTS[workspaceId] ??
    WORKSPACE_BUILDER_EXAMPLE_PROMPTS.backoffice
  );
}

export function workspaceBuilderSourceHint(workspaceId) {
  return (
    WORKSPACE_BUILDER_SOURCE_HINT[workspaceId] ??
    WORKSPACE_BUILDER_SOURCE_HINT.backoffice
  );
}

export function workspaceBuilderMentionTypes(workspaceId) {
  return (
    WORKSPACE_BUILDER_MENTION_TYPES[workspaceId] ??
    WORKSPACE_BUILDER_MENTION_TYPES.backoffice
  );
}

export function workspaceBuilderMentionHint(workspaceId) {
  const types = workspaceBuilderMentionTypes(workspaceId);
  const labels = {
    product: "product",
    supplier: "supplier",
    customer: "customer",
    employee: "employee",
    user: "user",
    branch: "branch",
  };
  const list = types.map((t) => labels[t]).filter(Boolean);
  if (list.length === 0) return "Type @ to pick a related record.";
  if (list.length === 1) return `Type @ to pick a ${list[0]}.`;
  if (list.length === 2) return `Type @ to pick a ${list[0]} or ${list[1]}.`;
  return `Type @ to pick a ${list.slice(0, -1).join(", ")}, or ${list[list.length - 1]}.`;
}

export function workspaceBuilderPlaceholder(workspaceId) {
  switch (workspaceId) {
    case "hr":
      return "e.g. Attendance for @Jane last week\nPayroll totals by department this month";
    case "accounting":
      return "e.g. Expenses by account this month\nPayments received last 7 days";
    case "distribution":
      return "e.g. Orders by route this week\nDeliveries for @branch yesterday";
    case "hospitality_backoffice":
      return "e.g. Occupancy by room type\nFood & drink sales this week";
    default:
      return "e.g. Yesterday's sales for @Sugar\nDaily purchases by @supplier";
  }
}

/** @param {import("@/lib/nav-config").NavItem} item */
export function reportModuleForNavItem(item) {
  if (item.moduleAny?.length) return item.moduleAny[0];
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
  if (workspaceId === "backoffice" && isBackofficeFinanceReport(slug)) {
    return true;
  }

  if (statementReportBelongsToWorkspace(slug, workspaceId)) {
    return true;
  }

  const mod = reportModuleForSlug(slug);
  if (!mod) return workspaceId === "backoffice";
  return (WORKSPACE_REPORT_MODULES[workspaceId] ?? []).includes(mod);
}

function statementSlugFromNavItem(item) {
  if (item.reportKey && isStatementReportSlug(item.reportKey)) {
    return item.reportKey;
  }
  const fromHref = item.href?.match(/^\/reports\/([^/]+)/)?.[1];
  return fromHref && isStatementReportSlug(fromHref) ? fromHref : null;
}

/** @param {import("@/lib/nav-config").NavItem} item */
export function reportNavItemBelongsToWorkspace(item, workspaceId) {
  const modules = WORKSPACE_REPORT_MODULES[workspaceId];
  if (!modules?.length) return false;

  if (item.href === "/reports" || item.href === "/reports/builder") {
    return true;
  }

  const statementSlug = statementSlugFromNavItem(item);
  if (statementSlug && statementReportBelongsToWorkspace(statementSlug, workspaceId)) {
    if (workspaceId === "backoffice") {
      return item.module === "customers_suppliers";
    }
    return true;
  }

  if (item.reportKey && isBackofficeFinanceReport(item.reportKey) && workspaceId === "backoffice") {
    return true;
  }

  if (item.moduleAny?.length) {
    return item.moduleAny.some((key) => modules.includes(key));
  }

  const mod = reportModuleForNavItem(item);
  if (!mod) return false;
  return modules.includes(mod);
}

/** @param {string} workspaceId @param {Record<string, boolean> | undefined} enabledModules */
export function workspaceHasEnabledReports(workspaceId, enabledModules) {
  const isEnabled = (key) => Boolean(enabledModules?.[key]);
  const base = (WORKSPACE_REPORT_MODULES[workspaceId] ?? []).some(isEnabled);
  if (workspaceId === "backoffice") {
    return (
      base ||
      BACKOFFICE_FINANCE_REPORT_MODULES.some(isEnabled)
    );
  }
  return base;
}

/**
 * Filter hub categories to reports in the active workspace.
 * @param {ReturnType<import("@/lib/reports/catalog-ui").buildReportCategories>} categories
 * @param {string} workspaceId
 * @param {Record<string, boolean> | undefined} [enabledModules]
 */
export function filterReportCategoriesForWorkspace(categories, workspaceId, enabledModules) {
  const modules = new Set(WORKSPACE_REPORT_MODULES[workspaceId] ?? []);
  if (!modules.size) return [];

  const moduleEnabled = (key) => Boolean(enabledModules?.[key]);

  return categories
    .map((cat) => ({
      ...cat,
      reports: cat.reports.filter((r) => {
        if (r.isCustom) {
          return r.reportModule ? modules.has(r.reportModule) : workspaceId === "backoffice";
        }
        if (workspaceId === "backoffice" && isBackofficeFinanceReport(r.key)) {
          return isReportModuleEnabled(r.key, moduleEnabled);
        }
        const mod = reportModuleForSlug(r.key);
        return mod ? modules.has(mod) : workspaceId === "backoffice";
      }),
    }))
    .filter((cat) => cat.reports.length > 0)
    .map((cat) => ({ ...cat, count: cat.reports.length }));
}
