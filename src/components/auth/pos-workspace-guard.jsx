"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import {
  defaultWorkspaceId,
  needsWorkspaceSelection,
  workspaceLandingPath,
} from "@/lib/workspace-navigation";
import { getStoredWorkspace, getStoredLoginChannel } from "@/lib/auth-storage";
import { POS_LOGIN_CHANNEL } from "@/lib/login-channels";
import { buildAccessContext, isPlatformShellUser, resolveTillFloatNavFlag } from "@/lib/access-control";
import {
  isPosWorkspace,
  pathBelongsToWorkspace,
} from "@/lib/workspaces";

/** Keeps POS shell routes scoped to the POS workspace. */
export function PosWorkspaceGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organization, capabilities, loading, isSuperAdmin, loginChannel, switchWorkspace } = useAuth();
  const [channelRestoreError, setChannelRestoreError] = useState(null);
  const [channelRetryToken, setChannelRetryToken] = useState(0);

  const ctx = useMemo(
    () =>
      buildAccessContext({
        user,
        organization,
        capabilities,
        requireTillFloat: resolveTillFloatNavFlag(capabilities),
        isSuperAdmin,
      }),
    [user, organization, capabilities, isSuperAdmin],
  );

  const storedWorkspace = getStoredWorkspace();
  const platformUser = isPlatformShellUser(ctx);

  const accessState = useMemo(() => {
    if (loading || platformUser) return "allow";
    if (needsWorkspaceSelection(capabilities, storedWorkspace, ctx)) {
      return "redirect-workspace";
    }
    const workspaceId = storedWorkspace ?? defaultWorkspaceId(capabilities, ctx);
    if (!workspaceId) return "wait";
    if (!isPosWorkspace(workspaceId)) return "redirect-landing";
    if (!pathBelongsToWorkspace(pathname, workspaceId)) return "redirect-home";
    return "allow";
  }, [capabilities, ctx, loading, pathname, platformUser, storedWorkspace]);

  useEffect(() => {
    if (loading || platformUser) return;

    const accessCtx = buildAccessContext({
      user,
      organization,
      capabilities,
      requireTillFloat: resolveTillFloatNavFlag(capabilities),
      isSuperAdmin,
    });

    if (accessState === "redirect-workspace") {
      if (pathname !== "/choose-workspace") {
        router.replace("/choose-workspace");
      }
      return;
    }

    const workspaceId = storedWorkspace ?? defaultWorkspaceId(capabilities, accessCtx);
    if (!workspaceId) return;

    if (accessState === "redirect-landing") {
      router.replace(
        workspaceLandingPath(user?.id, organization?.id, workspaceId, capabilities, accessCtx),
      );
      return;
    }

    if (accessState === "redirect-home") {
      const landingPath = workspaceLandingPath(
        user?.id,
        organization?.id,
        workspaceId,
        capabilities,
        accessCtx,
      );
      if (pathname !== landingPath) {
        router.replace(landingPath);
      }
    }
  }, [
    accessState,
    capabilities,
    loading,
    organization?.id,
    pathname,
    platformUser,
    router,
    storedWorkspace,
    user?.id,
    isSuperAdmin,
    user,
    organization,
  ]);

  useEffect(() => {
    if (loading || platformUser) return;
    const accessCtx = buildAccessContext({
      user,
      organization,
      capabilities,
      requireTillFloat: resolveTillFloatNavFlag(capabilities),
      isSuperAdmin,
    });
    const workspaceId = storedWorkspace ?? defaultWorkspaceId(capabilities, accessCtx);
    if (!isPosWorkspace(workspaceId)) return;
    // Prefer stored channel — React state can lag right after WorkspaceSwitcher.
    if (loginChannel === POS_LOGIN_CHANNEL || getStoredLoginChannel() === POS_LOGIN_CHANNEL) {
      setChannelRestoreError(null);
      return;
    }
    switchWorkspace("pos").then(
      () => setChannelRestoreError(null),
      (err) => {
        console.error("Failed to switch to POS session", err);
        setChannelRestoreError(
          err instanceof Error ? err.message : "Could not restore the POS session.",
        );
      },
    );
  }, [
    channelRetryToken,
    capabilities,
    loading,
    loginChannel,
    platformUser,
    storedWorkspace,
    switchWorkspace,
    isSuperAdmin,
    user,
    organization,
  ]);

  if (loading || accessState === "wait") {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 text-slate-600">
        Loading…
      </div>
    );
  }

  if (platformUser) return <>{children}</>;

  if (accessState !== "allow") return null;

  if (loginChannel !== POS_LOGIN_CHANNEL && getStoredLoginChannel() !== POS_LOGIN_CHANNEL) {
    if (channelRestoreError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 bg-slate-100 px-6 text-center text-slate-600">
          <p>{channelRestoreError}</p>
          <button
            type="button"
            className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
            onClick={() => {
              setChannelRestoreError(null);
              setChannelRetryToken((token) => token + 1);
            }}
          >
            Retry
          </button>
        </div>
      );
    }

    return (
      <div className="flex h-full items-center justify-center bg-slate-100 text-slate-600">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
