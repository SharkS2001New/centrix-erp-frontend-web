import { normalizeNotificationActionUrl } from "@/lib/notification-action-url";

/** Action-request module keys grouped by product workspace. */
const MODULES_BY_WORKSPACE = {
  backoffice: ["sales", "purchasing", "inventory"],
  accounting: ["accounting"],
  hr: ["hr_payroll"],
  admin: ["admin"],
  pos: ["sales"],
  hotel_bar_pos: ["hospitality"],
  hospitality_backoffice: ["hospitality"],
  distribution: [],
};

/**
 * Path prefixes that belong to each workspace for notification filtering.
 * Intentionally narrower than pathBelongsToWorkspace — Distribution can deep-link
 * to a sales order in the UI, but must not inherit Backoffice sales approvals.
 */
const PREFIXES_BY_WORKSPACE = {
  pos: ["/pos", "/sales/pos"],
  hotel_bar_pos: ["/hotel-bar-pos"],
  hospitality_backoffice: ["/hospitality"],
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
    "/fulfillment/routes",
    "/sales/picking-lists",
    "/fulfillment/loading-lists",
  ],
  admin: ["/admin", "/vats"],
  accounting: ["/accounting", "/expenses", "/finance"],
  hr: ["/hr", "/employees"],
  distribution: ["/fulfillment", "/dispatch-trips"],
};

const BACKOFFICE_ONLY_REQUEST_TYPES = new Set([
  "discount",
  "order_cancel",
  "customer_return",
  "supplier_return",
  "lpo",
  "lpo_approval",
  "stock_adjustment",
  "stock_transfer",
  "stock_take",
  "damage",
]);

function workspaceForActionPath(path) {
  if (!path || path === "/notifications") return null;

  let bestId = null;
  let bestLen = -1;
  for (const [workspaceId, prefixes] of Object.entries(PREFIXES_BY_WORKSPACE)) {
    for (const prefix of prefixes) {
      if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(prefix)) {
        // Prefer exact/longer prefixes so /fulfillment/routes stays Backoffice.
        const score = prefix.length;
        if (score > bestLen) {
          bestLen = score;
          bestId = workspaceId;
        }
      }
    }
  }
  return bestId;
}

/**
 * Whether an in-app notification belongs to the active product workspace.
 *
 * @param {object | null | undefined} item
 * @param {string | null | undefined} workspaceId
 */
export function notificationBelongsToWorkspace(item, workspaceId) {
  if (!workspaceId) return true;

  const requestType = String(item?.action_request?.type ?? "").toLowerCase();
  if (requestType && BACKOFFICE_ONLY_REQUEST_TYPES.has(requestType)) {
    return workspaceId === "backoffice" || (workspaceId === "pos" && requestType === "discount");
  }

  if (isDiscountLikeNotification(item)) {
    return workspaceId === "backoffice" || workspaceId === "pos";
  }

  const actionUrl = normalizeNotificationActionUrl(item?.action_url);
  const path = actionUrl?.split("?")[0] ?? "";

  if (path && path !== "/notifications") {
    // Distribution must never show sales/POS queue or order notifications.
    if (
      workspaceId === "distribution" &&
      (path.startsWith("/sales/") || path === "/sales" || path.startsWith("/pos"))
    ) {
      return false;
    }

    const owning = workspaceForActionPath(path);
    if (owning) {
      return owning === workspaceId;
    }
  }

  const requestModule = item?.action_request?.module;
  if (requestModule) {
    return (MODULES_BY_WORKSPACE[workspaceId] ?? []).includes(requestModule);
  }

  // Unscoped system notices (no path / module) stay in Backoffice.
  return workspaceId === "backoffice";
}

function isDiscountLikeNotification(item) {
  if (item?.action_request?.type === "discount") return true;
  if (item?.discount_approval) return true;
  const title = String(item?.title ?? "");
  const message = String(item?.message ?? "");
  return /discount/i.test(title) || /discount approval/i.test(message);
}

export function notificationWorkspaceQueryParam(workspaceId) {
  return workspaceId ? { workspace: workspaceId } : {};
}

export function filterNotificationsForWorkspace(items, workspaceId) {
  if (!Array.isArray(items)) return [];
  if (!workspaceId) return items;
  return items.filter((item) => notificationBelongsToWorkspace(item, workspaceId));
}
