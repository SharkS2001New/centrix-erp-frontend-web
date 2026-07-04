/** @typedef {import('@/contexts/auth-context').AuthContextValue['hasPermission']} HasPermissionFn */

const ORDER_QUEUE_SLUGS = [
  "all",
  "booked",
  "pending",
  "unpaid",
  "pending_payment",
  "paid",
  "processed",
  "delivered",
  "completed",
  "cancelled",
  "expired",
  "mobile",
];

export function orderQueueFeatureKey(slug) {
  const normalized = String(slug ?? "all").toLowerCase().trim();
  return `order_queue_${normalized.replace(/-/g, "_")}`;
}

export function orderQueuePermissionCode(slug) {
  return `sales.${orderQueueFeatureKey(slug)}.view`;
}

/** Legacy umbrella — grants every order queue link. */
export const SALES_ORDERS_VIEW_ALL_QUEUES = "sales.orders.view";

/**
 * @param {string} slug
 * @param {HasPermissionFn} hasPermission
 */
export function canViewOrderQueue(slug, hasPermission) {
  if (typeof hasPermission !== "function") return false;
  if (hasPermission(SALES_ORDERS_VIEW_ALL_QUEUES)) return true;
  return hasPermission(orderQueuePermissionCode(slug));
}

/**
 * @param {HasPermissionFn} hasPermission
 */
export function canViewAnySalesOrderQueue(hasPermission) {
  if (typeof hasPermission !== "function") return false;
  if (hasPermission(SALES_ORDERS_VIEW_ALL_QUEUES) || hasPermission("sales.view")) return true;
  return ORDER_QUEUE_SLUGS.some((slug) => hasPermission(orderQueuePermissionCode(slug)));
}

export { ORDER_QUEUE_SLUGS };
