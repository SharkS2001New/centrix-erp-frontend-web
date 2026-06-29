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
  needsWorkspaceSelection,
  pathBelongsToWorkspace,
  workspaceHomePath,
} from "@/lib/workspaces";

/** Keeps POS shell routes scoped to the POS workspace. */
export function PosWorkspaceGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organization, capabilities, loading, isSuperAdmin, loginChannel, switchWorkspace } = useAuth();

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

    if (!isPosWorkspace(workspaceId)) {
      router.replace(
        workspaceLandingPath(user?.id, organization?.id, workspaceId, capabilities, ctx),
      );
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

  useEffect(() => {
    if (loading || platformUser) return;
    const workspaceId = storedWorkspace ?? defaultWorkspaceId(capabilities, ctx);
    if (!isPosWorkspace(workspaceId)) return;
    if (loginChannel === POS_LOGIN_CHANNEL) return;
    switchWorkspace("pos").catch((err) => {
      console.error("Failed to switch to POS session", err);
    });
  }, [capabilities, ctx, loading, loginChannel, platformUser, storedWorkspace, switchWorkspace]);

  if (platformUser) return <>{children}</>;

  return <>{children}</>;
}
