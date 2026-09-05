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

/** Hotel operations screens under Admin → Operations (hospitality industry only). */
export const ADMIN_HOSPITALITY_OPS_PATH_PREFIXES = [
  "/hospitality/housekeeping",
  "/hospitality/outlets",
  "/hospitality/night-audit",
];

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
    "shop_debtors",
    "field_sales",
    "legacy_system",
    "after_sales",
    "promotions",
    "customers",
    "expenses",
    "investors",
    "inventory",
    "stock_movements",
    "suppliers",
    "reports",
  ],
  hospitality_backoffice: [
    "hospitality_dashboard",
    "hospitality_rooms",
    "hospitality_catalogue",
    "hospitality_sales",
    "hospitality_stock",
    "hospitality_purchasing",
    "reports",
  ],
  admin: [
    "admin_dashboard",
    "admin_organization",
    "admin_users",
    "admin_finance",
    "admin_tax",
    "hospitality_ops",
  ],
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
        "hospitality_catalogue",
        "hospitality_sales",
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
        "admin_finance",
        "admin_tax",
        "hospitality_ops",
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
    "/investors",
    "/routes",
    "/till-management",
    "/platform",
  ],
  admin: ["/admin", ...ADMIN_HOSPITALITY_OPS_PATH_PREFIXES],
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
    filterWorkspacesByIndustry(capabilities?.workspaces ?? [], industry).filter(
      (ws) => ws.id !== "centrix_payments",
    ),
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
    item.href === "/admin/kra-settings" ||
    item.href?.startsWith("/admin/kra-settings/") ||
    item.href === "/admin/mpesa-settings" ||
    item.href?.startsWith("/admin/mpesa-settings/") ||
    item.href === "/admin/mpesa-paybills" ||
    item.href?.startsWith("/admin/mpesa-paybills/") ||
    item.href === "/admin/equity-accounts" ||
    item.href?.startsWith("/admin/equity-accounts/")
  ) {
    return workspaceId === "admin";
  }

  if (
    item.href &&
    SHARED_WORKSPACE_PATHS.some((p) => item.href === p || item.href.startsWith(`${p}/`))
  ) {
    return true;
  }

  if (workspaceId === "admin") {
    if (item.href?.startsWith("/admin")) return true;
    if (
      ADMIN_HOSPITALITY_OPS_PATH_PREFIXES.some(
        (p) => item.href === p || item.href?.startsWith(`${p}/`),
      )
    ) {
      return true;
    }
    return false;
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
    if (item.href === "/admin/hotel-settings") {
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
    if (item.href === "/fulfillment/drivers" || item.href?.startsWith("/fulfillment/drivers/")) {
      return true;
    }
    if (item.href === "/fulfillment/vehicles" || item.href?.startsWith("/fulfillment/vehicles/")) {
      return true;
    }
    if (item.href === "/sales/loading-sheets" || item.href?.startsWith("/sales/loading-sheets/")) {
      return true;
    }
    if (item.href === "/sales/picking-lists" || item.href?.startsWith("/sales/picking-lists/")) {
      return true;
    }
    if (item.href === "/sales/trip-charts" || item.href?.startsWith("/sales/trip-charts/")) {
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
  // Tab hrefs often include ?query — strip so report slug matching stays clean.
  const path = String(pathname || "").split(/[?#]/)[0] || "";
  if (!path || SHARED_WORKSPACE_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
    return true;
  }

  if (workspaceId === "pos" || workspaceId === "hotel_bar_pos") {
    const prefixes = WORKSPACE_PATH_PREFIXES[workspaceId] ?? [];
    return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
  }

  if (workspaceId === "admin") {
    const prefixes = WORKSPACE_PATH_PREFIXES.admin ?? [];
    if (prefixes.some((p) => path === p || path.startsWith(`${p}/`))) {
      return true;
    }
    if (
      ADMIN_HOSPITALITY_OPS_PATH_PREFIXES.some(
        (p) => path === p || path.startsWith(`${p}/`),
      )
    ) {
      return true;
    }
    return false;
  }

  const prefixes = WORKSPACE_PATH_PREFIXES[workspaceId] ?? [];
  if (prefixes.some((p) => path === p || path.startsWith(`${p}/`))) {
    return true;
  }

  if (
    workspaceId === "hospitality_backoffice" &&
    (path === "/admin/hotel-settings" ||
      path.startsWith("/admin/hotel-settings/"))
  ) {
    return true;
  }

  if (workspaceId === "distribution" && /^\/sales\/orders\/[^/]+/.test(path)) {
    return true;
  }

  if (
    workspaceId === "backoffice" &&
    (      path === "/fulfillment/routes" ||
      path.startsWith("/fulfillment/routes/") ||
      path === "/fulfillment/drivers" ||
      path.startsWith("/fulfillment/drivers/") ||
      path === "/fulfillment/vehicles" ||
      path.startsWith("/fulfillment/vehicles/") ||
      path === "/sales/loading-sheets" ||
      path.startsWith("/sales/loading-sheets/") ||
      path === "/sales/picking-lists" ||
      path.startsWith("/sales/picking-lists/") ||
      path === "/sales/trip-charts" ||
      path.startsWith("/sales/trip-charts/") ||
      path === "/fulfillment/loading-lists" ||
      path.startsWith("/fulfillment/loading-lists/"))
  ) {
    return true;
  }

  if (path === "/reports" || path.startsWith("/reports/")) {
    if (path === "/reports" || path === "/reports/builder") {
      return Object.hasOwn(WORKSPACE_REPORT_MODULES, workspaceId);
    }
    const slugMatch = path.match(/^\/reports\/([^/]+)/);
    if (!slugMatch) {
      return workspaceId === "backoffice";
    }
    const slug = slugMatch[1];
    if (slug === "custom") return Object.hasOwn(WORKSPACE_REPORT_MODULES, workspaceId);
    return reportSlugBelongsToWorkspace(slug, workspaceId);
  }

  return false;
}

/**
 * Which application owns a path for deep-links (AI chat, notifications).
 * Stays on the current workspace when it already owns the route; otherwise
 * picks the best match among accessible workspaces (longest path prefix).
 *
 * @param {string | null | undefined} pathname
 * @param {Array<{ id: string }>} workspaces
 * @param {string | null | undefined} currentWorkspaceId
 * @returns {string | null}
 */
export function owningWorkspaceIdForPath(pathname, workspaces, currentWorkspaceId = null) {
  const pathOnly = String(pathname || "").split("?")[0] || "";
  if (!pathOnly) return currentWorkspaceId ?? null;

  if (SHARED_WORKSPACE_PATHS.some((p) => pathOnly === p || pathOnly.startsWith(`${p}/`))) {
    return currentWorkspaceId ?? null;
  }

  if (currentWorkspaceId && pathBelongsToWorkspace(pathOnly, currentWorkspaceId)) {
    return currentWorkspaceId;
  }

  const owners = (workspaces ?? []).filter((w) => pathBelongsToWorkspace(pathOnly, w.id));
  if (owners.length === 0) return null;
  if (owners.length === 1) return owners[0].id;

  let best = owners[0];
  let bestLen = -1;
  for (const w of owners) {
    let matchLen = 0;
    for (const p of WORKSPACE_PATH_PREFIXES[w.id] ?? []) {
      if (pathOnly === p || pathOnly.startsWith(`${p}/`)) {
        matchLen = Math.max(matchLen, p.length);
      }
    }
    if (
      matchLen > bestLen ||
      (matchLen === bestLen && w.id !== "backoffice" && best.id === "backoffice")
    ) {
      bestLen = matchLen;
      best = w;
    }
  }

  return best.id;
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
