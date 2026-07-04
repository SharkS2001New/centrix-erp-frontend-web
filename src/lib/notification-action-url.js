import { getStoredWorkspace } from "@/lib/auth-storage";
import { canAccessRoute } from "@/lib/route-access";
import { pathBelongsToWorkspace, workspacesFromCapabilities } from "@/lib/workspaces";

/** Map legacy / API-style notification paths to in-app routes. */
export function normalizeNotificationActionUrl(actionUrl) {
  if (!actionUrl || typeof actionUrl !== "string") return null;
  const trimmed = actionUrl.trim();
  if (!trimmed) return null;

  const [path, query = ""] = trimmed.split("?");
  const suffix = query ? `?${query}` : "";

  const tripMatch = path.match(/^\/dispatch-trips\/(\d+)$/);
  if (tripMatch) {
    return `/fulfillment/trips/${tripMatch[1]}${suffix}`;
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Whether a notification link can open from the user's current workspace.
 *
 * @param {string | null | undefined} actionUrl
 * @param {{ capabilities?: object, ctx?: object | null, storedWorkspaceId?: string | null }} options
 */
export function resolveNotificationLinkAccess(actionUrl, { capabilities, ctx, storedWorkspaceId } = {}) {
  const normalizedUrl = normalizeNotificationActionUrl(actionUrl);
  if (!normalizedUrl) {
    return { canOpen: false, normalizedUrl: null, message: null, targetWorkspaceLabel: null };
  }

  const pathOnly = normalizedUrl.split("?")[0];
  const workspaces = workspacesFromCapabilities(capabilities);
  const currentWorkspaceId = storedWorkspaceId ?? getStoredWorkspace() ?? null;
  const owningWorkspaces = workspaces.filter((workspace) =>
    pathBelongsToWorkspace(pathOnly, workspace.id),
  );

  if (owningWorkspaces.length === 0) {
    return {
      canOpen: false,
      normalizedUrl,
      message: "This screen is not available in your current module.",
      targetWorkspaceLabel: null,
    };
  }

  const inCurrentModule =
    currentWorkspaceId && pathBelongsToWorkspace(pathOnly, currentWorkspaceId);

  if (!inCurrentModule) {
    const target = owningWorkspaces[0];
    const moduleLabel = target?.label ?? "another module";
    return {
      canOpen: false,
      normalizedUrl,
      message: `This link belongs to ${moduleLabel}. Switch modules from the application menu to open it.`,
      targetWorkspaceLabel: moduleLabel,
      targetWorkspaceId: target?.id ?? null,
    };
  }

  if (ctx && !canAccessRoute(pathOnly, ctx)) {
    return {
      canOpen: false,
      normalizedUrl,
      message: "You do not have permission to open this screen.",
      targetWorkspaceLabel: null,
    };
  }

  return {
    canOpen: true,
    normalizedUrl,
    message: null,
    targetWorkspaceLabel: null,
    targetWorkspaceId: currentWorkspaceId,
  };
}
