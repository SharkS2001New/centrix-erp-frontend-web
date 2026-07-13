import { normalizeNotificationActionUrl } from "@/lib/notification-action-url";
import { pathBelongsToWorkspace } from "@/lib/workspaces";

/** Action-request module keys grouped by product workspace. */
const MODULES_BY_WORKSPACE = {
  backoffice: ["sales", "purchasing", "inventory"],
  accounting: ["accounting"],
  hr: ["hr_payroll"],
  admin: ["admin"],
  pos: ["sales"],
  distribution: [],
};

/**
 * Whether an in-app notification belongs to the active product workspace.
 *
 * @param {object | null | undefined} item
 * @param {string | null | undefined} workspaceId
 */
export function notificationBelongsToWorkspace(item, workspaceId) {
  if (!workspaceId) return true;

  const actionUrl = normalizeNotificationActionUrl(item?.action_url);
  const path = actionUrl?.split("?")[0] ?? "";

  if (path && path !== "/notifications") {
    return pathBelongsToWorkspace(path, workspaceId);
  }

  const module = item?.action_request?.module;
  if (module) {
    return (MODULES_BY_WORKSPACE[workspaceId] ?? []).includes(module);
  }

  return workspaceId === "backoffice";
}

export function notificationWorkspaceQueryParam(workspaceId) {
  return workspaceId ? { workspace: workspaceId } : {};
}
