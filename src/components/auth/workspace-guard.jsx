"use client";

import { useEffect, useRef, useState } from "react";
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
  const workspaceSyncedKeyRef = useRef(null);

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
  // Do not call switch-workspace after a normal backoffice login just to stamp
  // active_workspace_id — that rebuilt capabilities and slowed first paint.
  const [channelRestoreError, setChannelRestoreError] = useState(null);
  const [channelRetryToken, setChannelRetryToken] = useState(0);

  useEffect(() => {
    if (loading || platformUser) {
      setChannelReady(true);
      setChannelRestoreError(null);
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
    if (!workspaceId) {
      setChannelReady(true);
      setChannelRestoreError(null);
      return;
    }

    const syncKey = `${organization?.id ?? ""}:${workspaceId}:${loginChannel ?? ""}`;
    // Hold the shell only when the Sanctum channel must change (POS ↔ backoffice).
    // Do not POST /auth/switch-workspace merely to stamp active_workspace_id after login —
    // that rebuilt capabilities and made login feel slow.
    const needsPosChannelRestore =
      loginChannel === POS_LOGIN_CHANNEL && !isPosWorkspace(workspaceId);

    if (!needsPosChannelRestore) {
      workspaceSyncedKeyRef.current = syncKey;
      setChannelReady(true);
      setChannelRestoreError(null);
      return;
    }

    let cancelled = false;
    setChannelReady(false);
    setChannelRestoreError(null);
    switchWorkspace(workspaceId)
      .then(() => {
        if (!cancelled) {
          workspaceSyncedKeyRef.current = syncKey;
          setChannelReady(true);
          setChannelRestoreError(null);
        }
      })
      .catch((err) => {
        console.error("Failed to restore session workspace/channel", err);
        if (cancelled) return;
        setChannelReady(false);
        setChannelRestoreError(
          err instanceof Error && err.message
            ? err.message
            : "Could not restore the backoffice session. Try again.",
        );
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
    channelRetryToken,
  ]);

  if (channelRestoreError) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium text-slate-900">Session channel restore failed</p>
        <p className="max-w-md text-sm text-slate-600">{channelRestoreError}</p>
        <button
          type="button"
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          onClick={() => {
            setChannelRestoreError(null);
            setChannelRetryToken((n) => n + 1);
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  if (!channelReady) {
    return null;
  }

  return <>{children}</>;
}
