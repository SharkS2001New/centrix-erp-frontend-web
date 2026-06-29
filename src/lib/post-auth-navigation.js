import { setStoredWorkspace } from "@/lib/auth-storage";
import { POS_LOGIN_CHANNEL } from "@/lib/login-channels";
import {
  resolveAvailableWorkspaces,
  resolvePostLoginPath,
  workspaceLoginChannel,
} from "@/lib/workspaces";

/**
 * After mandatory password change or login, align workspace storage with available
 * modules and send the user to module selection (or a single module home).
 */
export async function navigateAfterAuthSessionReady(
  ctx,
  capabilities,
  router,
  { switchWorkspace } = {},
) {
  const workspaces = resolveAvailableWorkspaces(ctx, capabilities);

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

  router.replace(resolvePostLoginPath(ctx, capabilities));
}
