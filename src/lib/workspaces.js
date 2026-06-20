import { isNavItemVisible } from "@/lib/nav-config";
import { POS_LOGIN_CHANNEL, WEB_LOGIN_CHANNEL } from "@/lib/login-channels";
import {
  WORKSPACE_ANALYTICS_HREFS,
  WORKSPACE_HIDE_REPORTS_HUB,
  WORKSPACE_REPORT_MODULES,
  reportNavItemBelongsToWorkspace,
  reportSlugBelongsToWorkspace,
  workspaceHasEnabledReports,
} from "@/lib/workspace-reports";

export const WORKSPACE_ICONS = {
  building: "🏢",
  chart: "📊",
  people: "👥",
  pos: "🛒",
  truck: "🚛",
  app: "📱",
  settings: "⚙️",
};

/** Display order for the application switcher and choose-workspace screen. */
export const WORKSPACE_DISPLAY_ORDER = [
  "pos",
  "backoffice",
  "distribution",
  "accounting",
  "hr",
  "admin",
];

/**
 * @param {Array<{ id: string }>} workspaces
 */
export function sortWorkspaces(workspaces) {
  const rank = new Map(WORKSPACE_DISPLAY_ORDER.map((id, index) => [id, index]));
  return [...workspaces].sort(
    (a, b) => (rank.get(a.id) ?? 999) - (rank.get(b.id) ?? 999),
  );
}

/** Nav sections shown per workspace (reports filtered further by report module). */
export const WORKSPACE_SECTION_IDS = {
  pos: [],
  backoffice: [
    "dashboard",
    "products",
    "pos",
    "pricing_tax",
    "sales_orders",
    "field_sales",
    "after_sales",
    "promotions",
    "customers",
    "inventory",
    "stock_movements",
    "suppliers",
    "reports",
  ],
  admin: ["admin_dashboard", "admin_organization", "admin_users", "admin_finance_tax", "admin_settings"],
  accounting: ["dashboard", "accounting", "reports"],
  hr: ["dashboard", "hr_people", "hr_time_attendance", "hr_payroll", "hr_performance", "reports"],
  distribution: ["dashboard", "distribution_ops", "distribution_fleet", "distribution_orders", "reports"],
};

/** Sidebar zone headers for workspaces that still use grouped sections. */
export const WORKSPACE_NAV_ZONES = {
  accounting: [
    { label: null, sectionIds: ["dashboard", "accounting", "reports"] },
  ],
  hr: [
    { label: null, sectionIds: ["dashboard", "hr_people", "hr_time_attendance", "hr_payroll", "hr_performance", "reports"] },
  ],
  distribution: [
    {
      label: null,
      sectionIds: ["dashboard", "distribution_ops", "distribution_fleet", "distribution_orders", "reports"],
    },
  ],
  admin: [
    {
      label: null,
      sectionIds: [
        "admin_dashboard",
        "admin_organization",
        "admin_users",
        "admin_finance_tax",
        "admin_settings",
      ],
    },
  ],
};

/**
 * @param {import("@/lib/nav-config").NavSection[]} sections
 * @param {string} workspaceId
 * @returns {{ label: string | null, sections: import("@/lib/nav-config").NavSection[] }[]}
 */
export function groupNavSectionsByZone(sections, workspaceId) {
  const zones = WORKSPACE_NAV_ZONES[workspaceId];
  if (!zones?.length) {
    return [{ label: null, sections }];
  }

  const byId = new Map(sections.map((section) => [section.id, section]));
  const ordered = zones
    .flatMap((zone) => zone.sectionIds.map((id) => byId.get(id)).filter(Boolean));

  if (ordered.length === sections.length) {
    return [{ label: null, sections: ordered }];
  }

  return zones
    .map((zone) => ({
      label: zone.label,
      sections: zone.sectionIds.map((id) => byId.get(id)).filter(Boolean),
    }))
    .filter((zone) => zone.sections.length > 0);
}

/** Dashboard analytics links allowed per workspace. */
export const WORKSPACE_DASHBOARD_HREFS = WORKSPACE_ANALYTICS_HREFS;

/** Route prefixes owned by each workspace (reports handled separately). */
export const WORKSPACE_PATH_PREFIXES = {
  pos: ["/pos", "/sales/pos"],
  backoffice: [
    "/dashboard",
    "/sales",
    "/inventory",
    "/products",
    "/categories",
    "/sub-categories",
    "/uoms",
    "/retail-package-settings",
    "/vats",
    "/price-history",
    "/customers",
    "/suppliers",
    "/lpo",
    "/purchases",
    "/routes",
    "/till-management",
    "/platform",
  ],
  admin: ["/admin", "/vats"],
  accounting: ["/accounting", "/expenses", "/finance", "/vats"],
  hr: ["/hr", "/employees"],
  distribution: ["/fulfillment", "/fulfillment/orders", "/sales/orders"],
};

export const SHARED_WORKSPACE_PATHS = ["/profile", "/choose-workspace"];

export function workspaceIcon(iconKey) {
  return WORKSPACE_ICONS[iconKey] ?? WORKSPACE_ICONS.app;
}

/** API login channel for a product workspace (stored on the session token). */
export function workspaceLoginChannel(workspaceId) {
  return workspaceId === "pos" ? POS_LOGIN_CHANNEL : WEB_LOGIN_CHANNEL;
}

/** @param {object} capabilities */
export function workspacesFromCapabilities(capabilities) {
  return sortWorkspaces(capabilities?.workspaces ?? []);
}

/** @param {string} workspaceId */
export function workspaceDefinition(workspaceId, capabilities) {
  return workspacesFromCapabilities(capabilities).find((w) => w.id === workspaceId) ?? null;
}

/** @param {string} workspaceId */
export function workspaceHomePath(workspaceId, capabilities) {
  return workspaceDefinition(workspaceId, capabilities)?.home_path ?? "/dashboard";
}

/** @param {import("@/lib/nav-config").NavItem} item */
export function navItemBelongsToWorkspace(item, workspaceId) {
  if (workspaceId === "pos") {
    return false;
  }

  if (workspaceId === "admin") {
    return item.href?.startsWith("/admin") || item.href === "/vats";
  }

  if (item.href?.startsWith("/reports") || item.reportKey) {
    if (item.href === "/reports" && item.exact && WORKSPACE_HIDE_REPORTS_HUB.has(workspaceId)) {
      return false;
    }
    return reportNavItemBelongsToWorkspace(item, workspaceId);
  }

  if (item.href === "/dashboard") {
    return workspaceId === "backoffice";
  }

  const analytics = WORKSPACE_ANALYTICS_HREFS[workspaceId] ?? [];
  if (analytics.includes(item.href)) {
    return true;
  }

  if (item.group === "Analytics") {
    return false;
  }

  if (workspaceId === "accounting") {
    return (
      item.href?.startsWith("/accounting") ||
      item.href?.startsWith("/expenses") ||
      item.href?.startsWith("/finance") ||
      item.href === "/vats"
    );
  }

  if (workspaceId === "hr") {
    return item.href?.startsWith("/hr") || item.href?.startsWith("/employees");
  }

  if (workspaceId === "distribution") {
    return (
      item.href?.startsWith("/fulfillment") ||
      item.href?.startsWith("/sales/orders")
    );
  }

  if (workspaceId === "backoffice") {
    return pathBelongsToWorkspace(item.href, "backoffice");
  }

  return false;
}

/** @param {import("@/lib/nav-config").NavSection} section */
export function sectionBelongsToWorkspace(section, workspaceId) {
  return (WORKSPACE_SECTION_IDS[workspaceId] ?? []).includes(section.id);
}

/**
 * @param {string} pathname
 * @param {string} workspaceId
 */
export function pathBelongsToWorkspace(pathname, workspaceId) {
  if (!pathname || SHARED_WORKSPACE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }

  if (workspaceId === "pos") {
    const prefixes = WORKSPACE_PATH_PREFIXES.pos ?? [];
    return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }

  const prefixes = WORKSPACE_PATH_PREFIXES[workspaceId] ?? [];
  if (prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }

  if (pathname === "/reports" || pathname.startsWith("/reports/")) {
    if (pathname === "/reports" || pathname === "/reports/builder") {
      return Object.hasOwn(WORKSPACE_REPORT_MODULES, workspaceId);
    }
    const slugMatch = pathname.match(/^\/reports\/([^/]+)/);
    if (!slugMatch) {
      return workspaceId === "backoffice";
    }
    const slug = slugMatch[1];
    if (slug === "custom") return workspaceId === "backoffice";
    return reportSlugBelongsToWorkspace(slug, workspaceId);
  }

  return false;
}

/**
 * @param {object} ctx access context from buildAccessContext
 * @param {object} capabilities
 */
export function resolveAvailableWorkspaces(ctx, capabilities) {
  if (ctx?.platformShell) return [];
  return workspacesFromCapabilities(capabilities);
}

/**
 * Resolve the workspace the user is in (stored preference, else infer from route).
 * @param {Array<{ id: string }>} workspaces
 * @param {string | null | undefined} storedId
 * @param {string | null | undefined} pathname
 */
export function resolveActiveWorkspace(workspaces, storedId, pathname) {
  if (storedId) {
    const stored = workspaces.find((w) => w.id === storedId);
    if (stored) return stored;
  }

  if (pathname) {
    const fromPath = workspaces.find((w) => pathBelongsToWorkspace(pathname, w.id));
    if (fromPath) return fromPath;
  }

  return workspaces[0] ?? null;
}

/**
 * @param {object} ctx
 * @param {object} capabilities
 */
export function resolvePostLoginPath(ctx, capabilities) {
  if (ctx?.platformShell) {
    return "/platform";
  }

  const workspaces = resolveAvailableWorkspaces(ctx, capabilities);
  if (workspaces.length === 0) {
    return "/profile";
  }
  if (workspaces.length === 1) {
    return workspaces[0].home_path;
  }
  return "/choose-workspace";
}

/**
 * Filter nav sections for the active workspace.
 * @param {import("@/lib/nav-config").NavSection[]} sections
 */
export function filterNavSectionsForWorkspace(sections, workspaceId, navContext) {
  const sectionOrder = WORKSPACE_SECTION_IDS[workspaceId] ?? [];
  const orderRank = new Map(sectionOrder.map((id, index) => [id, index]));

  return sections
    .filter((section) => sectionBelongsToWorkspace(section, workspaceId))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.href === "/reports" && !workspaceHasEnabledReports(workspaceId, navContext?.capabilities?.modules)) {
          return false;
        }
        if (!navItemBelongsToWorkspace(item, workspaceId)) return false;
        return isNavItemVisible(item, navContext);
      }),
    }))
    .filter((section) => section.items.length > 0)
    .sort((a, b) => (orderRank.get(a.id) ?? 999) - (orderRank.get(b.id) ?? 999));
}

/** True when user must pick a workspace before using the app shell. */
export function needsWorkspaceSelection(capabilities, storedWorkspaceId, ctx) {
  if (ctx?.platformShell) return false;
  const workspaces = resolveAvailableWorkspaces(ctx, capabilities);
  if (workspaces.length <= 1) return false;
  return !storedWorkspaceId || !workspaces.some((w) => w.id === storedWorkspaceId);
}

export function isPosWorkspace(workspaceId) {
  return workspaceId === "pos";
}

export function defaultWorkspaceId(capabilities, ctx) {
  const workspaces = resolveAvailableWorkspaces(ctx, capabilities);
  return workspaces[0]?.id ?? null;
}
