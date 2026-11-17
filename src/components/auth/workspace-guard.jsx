"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { recallWorkspaceLandingPath, defaultWorkspaceId, needsWorkspaceSelection } from "@/lib/workspace-navigation";
import { isTabWorkspaceEnabled, seedWorkspaceTabLanding } from "@/lib/tab-workspace";
import { getStoredLoginChannel, getStoredWorkspace } from "@/lib/auth-storage";
import { buildAccessContext, isPlatformShellUser, resolveTillFloatNavFlag } from "@/lib/access-control";
import {
  isTerminalWorkspace,
  pathBelongsToWorkspace,
  workspaceHomePath,
  workspaceLoginChannel,
} from "@/lib/workspaces";

/** Route to the correct workspace — never block the shell on capabilities refresh. */
export function WorkspaceGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organization, capabilities, loading, isSuperAdmin, loginChannel, switchWorkspace } =
    useAuth();
  const [channelReady, setChannelReady] = useState(true);
  const workspaceSyncedKeyRef = useRef(null);

  const requireTillFloat = resolveTillFloatNavFlag(capabilities);
  const accessContext = buildAccessContext({
    user,
    organization,
    capabilities,
    requireTillFloat,
    isSuperAdmin,
  });
  const storedWorkspace = getStoredWorkspace();
  const workspaceId = storedWorkspace ?? defaultWorkspaceId(capabilities, accessContext);
  const expectedChannel = workspaceId ? workspaceLoginChannel(workspaceId) : null;
  const storedLoginChannel = getStoredLoginChannel();
  const platformUser = isPlatformShellUser(accessContext);

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

    // External POS and Hotel POS stay on the till, except the shared subscription overlay and billing page.
    if (isTerminalWorkspace(workspaceId) && !pathBelongsToWorkspace(pathname, workspaceId)) {
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
  // Same-channel workspace stamps (Hotel POS ↔ Hotel Backoffice) are cheap: the API
  // skips a capabilities rebuild and Active users can show the correct application.
  const [channelRestoreError, setChannelRestoreError] = useState(null);
  const [channelRetryToken, setChannelRetryToken] = useState(0);

  useEffect(() => {
    const onSessionStorageChange = (event) => {
      if (
        event.key !== null
        && event.key !== "pos_erp_login_channel"
        && event.key !== "pos_erp_workspace"
      ) {
        return;
      }
      setChannelRetryToken((value) => value + 1);
    };
    const onFocus = () => setChannelRetryToken((value) => value + 1);
    window.addEventListener("storage", onSessionStorageChange);
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("storage", onSessionStorageChange);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  useEffect(() => {
    if (loading || platformUser) {
      setChannelReady(true);
      setChannelRestoreError(null);
      return;
    }

    if (!workspaceId) {
      setChannelReady(true);
      setChannelRestoreError(null);
      return;
    }

    const syncKey = `${organization?.id ?? ""}:${workspaceId}:${loginChannel ?? ""}:${storedLoginChannel ?? ""}`;
    const channelMismatch =
      (loginChannel ?? "") !== expectedChannel
      || (storedLoginChannel != null && storedLoginChannel !== expectedChannel);

    // Channel already matches (e.g. Hotel POS on backoffice channel): stamp
    // active_workspace_id once without blocking the shell.
    if (!channelMismatch) {
      setChannelReady(true);
      setChannelRestoreError(null);
      if (workspaceSyncedKeyRef.current !== syncKey) {
        workspaceSyncedKeyRef.current = syncKey;
        switchWorkspace(workspaceId).catch((err) => {
          console.error("Failed to stamp session workspace", err);
          if (workspaceSyncedKeyRef.current === syncKey) {
            workspaceSyncedKeyRef.current = null;
          }
        });
      }
      return;
    }

    let cancelled = false;
    setChannelReady(false);
    setChannelRestoreError(null);
    switchWorkspace(workspaceId)
      .then(() => {
        if (!cancelled) {
          workspaceSyncedKeyRef.current =
            `${organization?.id ?? ""}:${workspaceId}:${expectedChannel}:${expectedChannel}`;
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
    pathname,
    platformUser,
    expectedChannel,
    storedLoginChannel,
    workspaceId,
    storedWorkspace,
    switchWorkspace,
    requireTillFloat,
    isSuperAdmin,
    user,
    organization,
    channelRetryToken,
  ]);

  const needsSelection = !loading
    && !platformUser
    && needsWorkspaceSelection(capabilities, storedWorkspace, accessContext);
  const workspacePathMismatch = !loading
    && !platformUser
    && Boolean(workspaceId)
    && !pathBelongsToWorkspace(pathname, workspaceId);

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

  if (
    (needsSelection && pathname !== "/choose-workspace")
    || workspacePathMismatch
    || (!platformUser && expectedChannel && storedLoginChannel && storedLoginChannel !== expectedChannel)
  ) {
    return null;
  }

  if (!channelReady) {
    return null;
  }

  return <>{children}</>;
}
