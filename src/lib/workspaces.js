import { POS_LOGIN_CHANNEL, WEB_LOGIN_CHANNEL } from "@/lib/login-channels";
import {
  WORKSPACE_ANALYTICS_HREFS,
  WORKSPACE_HIDE_REPORTS_HUB,
  WORKSPACE_REPORT_MODULES,
  reportNavItemBelongsToWorkspace,
  reportSlugBelongsToWorkspace,
  workspaceHasEnabledReports,
} from "@/lib/workspace-reports";
import {
  WORKSPACE_ICONS,
  sortWorkspaces,
} from "@/lib/workspace-constants";
import { filterWorkspacesByIndustry } from "@/lib/workspace-modules";

export { WORKSPACE_DISPLAY_ORDER, WORKSPACE_ICONS, sortWorkspaces } from "@/lib/workspace-constants";

/** Nav sections shown per workspace (reports filtered further by report module). */
export const WORKSPACE_SECTION_IDS = {
  pos: [],
  hotel_bar_pos: [],
  backoffice: [
    "dashboard",
    "products",
    "pos",
    "pricing_tax",
    "sales_orders",
    "field_sales",
    "legacy_system",
    "after_sales",
    "promotions",
    "customers",
    "expenses",
    "inventory",
    "stock_movements",
    "suppliers",
    "reports",
  ],
  hospitality_backoffice: [
    "hospitality_dashboard",
    "hospitality_rooms",
    "hospitality_ops",
    "hospitality_sales",
    "hospitality_catalogue",
    "hospitality_stock",
    "hospitality_purchasing",
    "reports",
  ],
  admin: ["admin_dashboard", "admin_organization", "admin_users", "admin_finance_tax"],
  accounting: ["accounting", "expenses", "reports"],
  hr: ["hr_people", "hr_time_attendance", "hr_payroll", "hr_performance", "reports"],
  distribution: ["dashboard", "distribution_ops", "distribution_fleet", "distribution_orders", "reports"],
};

/** Sidebar zone headers for workspaces that still use grouped sections. */
export const WORKSPACE_NAV_ZONES = {
  accounting: [
    { label: null, sectionIds: ["accounting", "expenses", "reports"] },
  ],
  hr: [
    { label: null, sectionIds: ["hr_people", "hr_time_attendance", "hr_payroll", "hr_performance", "reports"] },
  ],
  distribution: [
    {
      label: null,
      sectionIds: ["dashboard", "distribution_ops", "distribution_fleet", "distribution_orders", "reports"],
    },
  ],
  hospitality_backoffice: [
    {
      label: null,
      sectionIds: [
        "hospitality_dashboard",
        "hospitality_rooms",
        "hospitality_ops",
        "hospitality_sales",
        "hospitality_catalogue",
        "hospitality_stock",
        "hospitality_purchasing",
        "reports",
      ],
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
  pos: ["/pos"],
  hotel_bar_pos: ["/hotel-bar-pos"],
  hospitality_backoffice: [
    "/hospitality",
    "/products",
    "/categories",
    "/uoms",
    "/inventory",
    "/suppliers",
    "/lpo",
    "/purchases",
  ],
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
    "/expenses",
    "/routes",
    "/till-management",
    "/platform",
  ],
  admin: ["/admin"],
  accounting: ["/accounting", "/expenses", "/finance"],
  hr: ["/hr", "/employees"],
  distribution: ["/fulfillment"],
};

export const SHARED_WORKSPACE_PATHS = ["/profile", "/choose-workspace", "/notifications"];

export function workspaceIcon(iconKey) {
  return WORKSPACE_ICONS[iconKey] ?? WORKSPACE_ICONS.app;
}

/** API login channel for a product workspace (stored on the session token). */
export function workspaceLoginChannel(workspaceId) {
  // Only retail External POS uses the POS token channel.
  // Hotel POS uses the web/backoffice channel (hospitality APIs).
  return workspaceId === "pos" ? POS_LOGIN_CHANNEL : WEB_LOGIN_CHANNEL;
}

/** @param {object} capabilities */
export function workspacesFromCapabilities(capabilities) {
  const industry =
    capabilities?.industry ??
    (capabilities?.deployment_profile === "hotel_bar" ? "hospitality" : "commerce");
  return sortWorkspaces(
    filterWorkspacesByIndustry(capabilities?.workspaces ?? [], industry),
  );
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
  if (isTerminalWorkspace(workspaceId)) {
    return false;
  }

  if (item.href === "/admin/settings" || item.href?.startsWith("/admin/settings/")) {
    return workspaceId === "admin";
  }

  if (item.href === "/admin/themes" || item.href?.startsWith("/admin/themes/")) {
    return workspaceId === "admin";
  }

  if (
    item.href &&
    SHARED_WORKSPACE_PATHS.some((p) => item.href === p || item.href.startsWith(`${p}/`))
  ) {
    return true;
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
      item.href?.startsWith("/finance")
    );
  }

  if (workspaceId === "hr") {
    return item.href?.startsWith("/hr") || item.href?.startsWith("/employees");
  }

  if (workspaceId === "distribution") {
    if (item.href?.startsWith("/fulfillment")) {
      return true;
    }
    // Allow opening a specific sales order from distribution workflows (dispatch, POD, trips).
    if (item.href?.match(/^\/sales\/orders\/[^/]+/)) {
      return true;
    }
    return false;
  }

  if (workspaceId === "hospitality_backoffice") {
    if (item.href?.startsWith("/hospitality")) {
      return true;
    }
    return pathBelongsToWorkspace(item.href, "hospitality_backoffice");
  }

  if (workspaceId === "backoffice") {
    if (item.href === "/expenses" || item.href?.startsWith("/expenses/")) {
      return true;
    }
    if (item.href === "/fulfillment/routes" || item.href?.startsWith("/fulfillment/routes/")) {
      return true;
    }
    if (item.href === "/sales/loading-sheets" || item.href?.startsWith("/sales/loading-sheets/")) {
      return true;
    }
    if (item.href === "/sales/picking-lists" || item.href?.startsWith("/sales/picking-lists/")) {
      return true;
    }
    if (item.href === "/fulfillment/loading-lists" || item.href?.startsWith("/fulfillment/loading-lists/")) {
      return true;
    }
    return pathBelongsToWorkspace(item.href, "backoffice");
  }

  return false;
}

/** @param {import("@/lib/nav-config").NavSection} section */
export function sectionBelongsToWorkspace(section, workspaceId) {
  if (section.sharedAcrossWorkspaces) {
    return workspaceId !== "pos";
  }

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

  if (workspaceId === "pos" || workspaceId === "hotel_bar_pos") {
    const prefixes = WORKSPACE_PATH_PREFIXES[workspaceId] ?? [];
    return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  }

  if (workspaceId === "admin") {
    const prefixes = WORKSPACE_PATH_PREFIXES.admin ?? [];
    if (prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return true;
    }
    // VAT rates are linked from Admin → Finance & tax as well as Backoffice.
    if (pathname === "/vats" || pathname.startsWith("/vats/")) {
      return true;
    }
    return false;
  }

  const prefixes = WORKSPACE_PATH_PREFIXES[workspaceId] ?? [];
  if (prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return true;
  }

  if (workspaceId === "distribution" && /^\/sales\/orders\/[^/]+/.test(pathname)) {
    return true;
  }

  if (
    workspaceId === "backoffice" &&
    (pathname === "/fulfillment/routes" ||
      pathname.startsWith("/fulfillment/routes/") ||
      pathname === "/sales/loading-sheets" ||
      pathname.startsWith("/sales/loading-sheets/") ||
      pathname === "/sales/picking-lists" ||
      pathname.startsWith("/sales/picking-lists/") ||
      pathname === "/fulfillment/loading-lists" ||
      pathname.startsWith("/fulfillment/loading-lists/"))
  ) {
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
 * @param {(workspaceId: string) => boolean} [isAccessible] optional filter — hide shells with no reachable routes
 */
export function resolveAvailableWorkspaces(ctx, capabilities, isAccessible) {
  if (ctx?.platformShell) return [];
  const workspaces = workspacesFromCapabilities(capabilities);
  if (typeof isAccessible !== "function") return workspaces;
  return workspaces.filter((workspace) => isAccessible(workspace.id));
}

/**
 * Distribution help belongs in the app header only while the Distribution workspace is active.
 * Routes live at /fulfillment/routes for both Backoffice and Distribution — use workspace, not path alone.
 */
export function shouldShowDistributionHelp(workspaces, storedId, pathname) {
  const active = resolveActiveWorkspace(workspaces, storedId, pathname);
  return active?.id === "distribution";
}

/**
 * Accounting help belongs in the app header only while the Accounting workspace is active.
 */
export function shouldShowAccountingHelp(workspaces, storedId, pathname) {
  const active = resolveActiveWorkspace(workspaces, storedId, pathname);
  return active?.id === "accounting";
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
 * Filter nav sections for the active workspace.
 * Pass `isItemVisible` from the caller (e.g. nav-config.isNavItemVisible) so this
 * module does not import nav-config and create a circular init cycle.
 * @param {import("@/lib/nav-config").NavSection[]} sections
 * @param {string} workspaceId
 * @param {object} navContext
 * @param {(item: object, ctx: object) => boolean} [isItemVisible]
 */
export function filterNavSectionsForWorkspace(sections, workspaceId, navContext, isItemVisible) {
  const sectionOrder = WORKSPACE_SECTION_IDS[workspaceId] ?? [];
  const orderRank = new Map(sectionOrder.map((id, index) => [id, index]));
  const visible = typeof isItemVisible === "function" ? isItemVisible : () => true;

  return sections
    .filter((section) => sectionBelongsToWorkspace(section, workspaceId))
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        if (item.href === "/reports" && !workspaceHasEnabledReports(workspaceId, navContext?.capabilities?.modules)) {
          return false;
        }
        if (!navItemBelongsToWorkspace(item, workspaceId)) return false;
        return visible(item, navContext);
      }),
    }))
    .filter((section) => section.items.length > 0)
    .sort((a, b) => (orderRank.get(a.id) ?? 999) - (orderRank.get(b.id) ?? 999));
}

export function isPosWorkspace(workspaceId) {
  return workspaceId === "pos";
}

/** Retail POS or Hotel & Bar POS — dedicated full-screen terminal shells. */
export function isTerminalWorkspace(workspaceId) {
  return workspaceId === "pos" || workspaceId === "hotel_bar_pos";
}

/** @deprecated Use defaultWorkspaceId from @/lib/workspace-navigation (filters empty shells). */
export function defaultWorkspaceId(capabilities, ctx) {
  const workspaces = resolveAvailableWorkspaces(ctx, capabilities);
  return workspaces[0]?.id ?? null;
}
