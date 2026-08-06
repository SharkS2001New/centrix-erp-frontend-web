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
  "pending_approval",
  "editable",
  "mobile",
];

export function orderQueueFeatureKey(slug) {
  const normalized = String(slug ?? "all").toLowerCase().trim();
  return `order_queue_${normalized.replace(/-/g, "_")}`;
}

export function orderQueuePermissionCode(slug) {
  return `sales.${orderQueueFeatureKey(slug)}.view`;
}

/**
 * Legacy “Order actions → View” code. Still used by some API/list scopes, but it must
 * NOT unlock Sales & orders sidebar queue links — those require the matching
 * sales.order_queue_{slug}.view grant shown on the Roles matrix.
 */
export const SALES_ORDERS_VIEW_ALL_QUEUES = "sales.orders.view";

/**
 * Sidebar / queue route visibility: exact per-queue grant only.
 *
 * @param {string} slug
 * @param {HasPermissionFn} hasPermission
 */
export function canViewOrderQueue(slug, hasPermission) {
  if (typeof hasPermission !== "function") return false;
  return hasPermission(orderQueuePermissionCode(slug));
}

/**
 * Opening a single sale (/sales/orders/:id): any explicit queue, or legacy Order actions View.
 *
 * @param {HasPermissionFn} hasPermission
 */
export function canViewAnySalesOrderQueue(hasPermission) {
  if (typeof hasPermission !== "function") return false;
  if (hasPermission(SALES_ORDERS_VIEW_ALL_QUEUES)) return true;
  return ORDER_QUEUE_SLUGS.some((slug) => hasPermission(orderQueuePermissionCode(slug)));
}

export { ORDER_QUEUE_SLUGS };
