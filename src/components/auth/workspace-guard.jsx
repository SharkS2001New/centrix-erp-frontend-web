"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { recallWorkspaceLandingPath, defaultWorkspaceId, needsWorkspaceSelection } from "@/lib/workspace-navigation";
import { isTabWorkspaceEnabled, seedWorkspaceTabLanding } from "@/lib/tab-workspace";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { POS_LOGIN_CHANNEL } from "@/lib/login-channels";
import { buildAccessContext, isPlatformShellUser, resolveTillFloatNavFlag } from "@/lib/access-control";
import {
  isPosWorkspace,
  isTerminalWorkspace,
  pathBelongsToWorkspace,
  workspaceHomePath,
} from "@/lib/workspaces";

/** Route to the correct workspace — never block the shell on capabilities refresh. */
export function WorkspaceGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organization, capabilities, loading, isSuperAdmin, loginChannel, switchWorkspace } =
    useAuth();
  const [channelReady, setChannelReady] = useState(true);

  const storedWorkspace = getStoredWorkspace();
  const requireTillFloat = resolveTillFloatNavFlag(capabilities);
  const platformUser = isPlatformShellUser(
    buildAccessContext({
      user,
      organization,
      capabilities,
      requireTillFloat,
      isSuperAdmin,
    }),
  );

  useEffect(() => {
    if (loading || platformUser) return;

    const ctx = buildAccessContext({
      user,
      organization,
      capabilities,
      requireTillFloat,
      isSuperAdmin,
    });

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
      const landingPath = recallWorkspaceLandingPath(
        user?.id,
        organization?.id,
        workspaceId,
        capabilities,
        ctx,
      );
      if (pathname !== landingPath) {
        if (isTabWorkspaceEnabled(capabilities)) {
          seedWorkspaceTabLanding(organization?.id, workspaceId, landingPath);
        }
        router.replace(landingPath);
      }
    }
  }, [
    capabilities,
    loading,
    organization?.id,
    pathname,
    platformUser,
    requireTillFloat,
    router,
    storedWorkspace,
    user?.id,
    isSuperAdmin,
    user,
    organization,
  ]);

  // Visiting /pos switches the Sanctum token to the POS channel. Switch back when
  // returning to backoffice/platform so Applications and other admin APIs work.
  // Hold the shell until the channel matches — otherwise screens race ahead and 403.
  useEffect(() => {
    if (loading || platformUser) {
      setChannelReady(true);
      return;
    }
    if (loginChannel !== POS_LOGIN_CHANNEL) {
      setChannelReady(true);
      return;
    }
    const ctx = buildAccessContext({
      user,
      organization,
      capabilities,
      requireTillFloat,
      isSuperAdmin,
    });
    const workspaceId = storedWorkspace ?? defaultWorkspaceId(capabilities, ctx);
    if (!workspaceId || isPosWorkspace(workspaceId)) {
      setChannelReady(true);
      return;
    }

    let cancelled = false;
    setChannelReady(false);
    switchWorkspace(workspaceId)
      .then(() => {
        if (!cancelled) setChannelReady(true);
      })
      .catch((err) => {
        console.error("Failed to restore backoffice session channel", err);
        if (!cancelled) setChannelReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [
    capabilities,
    loading,
    loginChannel,
    platformUser,
    storedWorkspace,
    switchWorkspace,
    requireTillFloat,
    isSuperAdmin,
    user,
    organization,
  ]);

  if (!channelReady) {
    return null;
  }

  return <>{children}</>;
}
