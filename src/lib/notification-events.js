const EVENT_NAME = "centrix:notifications-changed";

/** Signal that in-app notifications may have changed (new approval, reminder, outcome). */
export function notifyNotificationsChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

/** Subscribe to notification refresh signals. Returns an unsubscribe function. */
export function subscribeNotificationsChanged(handler) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

function responseRows(data) {
  if (!data || typeof data !== "object") return [];
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data)) return data;
  return [data];
}

/** Whether a successful API mutation likely created or resolved in-app notifications. */
export function mayAffectInAppNotifications(method, path, data) {
  if (typeof window === "undefined") return false;
  const verb = (method ?? "GET").toUpperCase();
  if (verb === "GET" || verb === "HEAD" || verb === "DELETE") return false;

  const normalized = path.replace(/^.*\/api\/v1/, "");

  if (/\/action-requests\/\d+\/(approve|reject|remind)$/.test(normalized)) return true;
  if (/\/workflow$/.test(normalized) && verb === "POST") return true;
  if (/\/(approve|reject)$/.test(normalized) && verb === "POST") return true;

  return responseRows(data).some((row) => {
    if (!row || typeof row !== "object") return false;
    if (row.pending_approval === true) return true;
    if (row.action_request_id) return true;
    if (row.action_request?.status === "pending") return true;
    if (row.approval_status === "pending") return true;
    if (row.status === "pending_approval") return true;
    if (row.status === "pending" && normalized.includes("cash-advance")) return true;
    return false;
  });
}
