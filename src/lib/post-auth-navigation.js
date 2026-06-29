import { getStoredWorkspace, setStoredWorkspace } from "@/lib/auth-storage";
import { resolveHomePath } from "@/lib/access-control";
import { POS_LOGIN_CHANNEL } from "@/lib/login-channels";
import {
  needsWorkspaceSelection,
  resolveActiveWorkspace,
  resolveAvailableWorkspaces,
  resolvePostLoginPath,
  workspaceLoginChannel,
} from "@/lib/workspaces";

/**
 * Best route off the profile screen when the user is not password-locked.
 */
export function resolveProfileExitPath(ctx, capabilities) {
  if (ctx?.platformShell) {
    return "/platform";
  }

  const workspaces = resolveAvailableWorkspaces(ctx, capabilities);
  const stored = getStoredWorkspace();

  if (workspaces.length > 1) {
    if (needsWorkspaceSelection(capabilities, stored, ctx)) {
      return "/choose-workspace";
    }
    const active = resolveActiveWorkspace(workspaces, stored, null);
    return active?.home_path ?? "/choose-workspace";
  }

  if (workspaces.length === 1) {
    return workspaces[0].home_path;
  }

  const home = resolveHomePath({ ...ctx, capabilities });
  if (home && home !== "/profile") {
    return home;
  }

  return "/choose-workspace";
}

function resolveDestinationPath(ctx, capabilities, { afterPasswordLock = false } = {}) {
  const workspaces = resolveAvailableWorkspaces(ctx, capabilities);
  const path = afterPasswordLock
    ? resolveProfileExitPath(ctx, capabilities)
    : resolvePostLoginPath(ctx, capabilities);

  return { path, workspaces };
}

/**
 * After mandatory password change or login, align workspace storage with available
 * modules and send the user to module selection (or a single module home).
 */
export async function navigateAfterAuthSessionReady(
  ctx,
  capabilities,
  router,
  { switchWorkspace, afterPasswordLock = false } = {},
) {
  const { path, workspaces } = resolveDestinationPath(ctx, capabilities, { afterPasswordLock });

  if (workspaces.length === 1) {
    const only = workspaces[0];
    if (workspaceLoginChannel(only.id) === POS_LOGIN_CHANNEL && switchWorkspace) {
      await switchWorkspace(only.id);
    } else {
      setStoredWorkspace(only.id);
    }
  } else if (workspaces.length > 1) {
    setStoredWorkspace(null);
  }

  router.replace(path);
}
