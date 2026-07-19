"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { workspaceLandingPath } from "@/lib/workspace-navigation";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { POS_LOGIN_CHANNEL } from "@/lib/login-channels";
import { buildAccessContext, isPlatformShellUser, resolveTillFloatNavFlag } from "@/lib/access-control";
import {
  defaultWorkspaceId,
  isPosWorkspace,
  isTerminalWorkspace,
  needsWorkspaceSelection,
  pathBelongsToWorkspace,
  workspaceHomePath,
} from "@/lib/workspaces";

/** Route to the correct workspace — never block the shell on capabilities refresh. */
export function WorkspaceGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organization, capabilities, loading, isSuperAdmin, loginChannel, switchWorkspace } =
    useAuth();

  const ctx = buildAccessContext({
    user,
    organization,
    capabilities,
    requireTillFloat: resolveTillFloatNavFlag(capabilities),
    isSuperAdmin,
  });

  const storedWorkspace = getStoredWorkspace();
  const platformUser = isPlatformShellUser(ctx);

  useEffect(() => {
    if (loading || platformUser) return;

    if (needsWorkspaceSelection(capabilities, storedWorkspace, ctx)) {
      if (pathname !== "/choose-workspace") {
        router.replace("/choose-workspace");
      }
      return;
    }

    const workspaceId = storedWorkspace ?? defaultWorkspaceId(capabilities, ctx);
    if (!workspaceId) return;

    if (isTerminalWorkspace(workspaceId)) {
      router.replace(workspaceHomePath(workspaceId, capabilities));
      return;
    }

    if (!pathBelongsToWorkspace(pathname, workspaceId)) {
      const landingPath = workspaceLandingPath(
        user?.id,
        organization?.id,
        workspaceId,
        capabilities,
        ctx,
      );
      if (pathname !== landingPath) {
        router.replace(landingPath);
      }
    }
  }, [capabilities, ctx, loading, organization?.id, pathname, platformUser, router, storedWorkspace, user?.id]);

  // Visiting /pos switches the Sanctum token to the POS channel. Switch back when
  // returning to backoffice/platform so Applications and other admin APIs work.
  useEffect(() => {
    if (loading || platformUser) return;
    if (loginChannel !== POS_LOGIN_CHANNEL) return;
    const workspaceId = storedWorkspace ?? defaultWorkspaceId(capabilities, ctx);
    if (!workspaceId || isPosWorkspace(workspaceId)) return;
    switchWorkspace(workspaceId).catch((err) => {
      console.error("Failed to restore backoffice session channel", err);
    });
  }, [capabilities, ctx, loading, loginChannel, platformUser, storedWorkspace, switchWorkspace]);

  return <>{children}</>;
}
