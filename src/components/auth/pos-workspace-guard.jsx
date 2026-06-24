"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
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
      router.replace(workspaceHomePath(workspaceId, capabilities));
      return;
    }

    if (!pathBelongsToWorkspace(pathname, workspaceId)) {
      router.replace(workspaceHomePath(workspaceId, capabilities));
    }
  }, [capabilities, ctx, loading, pathname, platformUser, router, storedWorkspace]);

  useEffect(() => {
    if (loading || platformUser) return;
    const workspaceId = storedWorkspace ?? defaultWorkspaceId(capabilities, ctx);
    if (!isPosWorkspace(workspaceId)) return;
    if (loginChannel === POS_LOGIN_CHANNEL) return;
    switchWorkspace("pos").catch((err) => {
      console.error("Failed to switch to POS session", err);
    });
  }, [capabilities, ctx, loading, loginChannel, platformUser, storedWorkspace, switchWorkspace]);

  if (loading || platformUser) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (needsWorkspaceSelection(capabilities, storedWorkspace, ctx)) {
    return pathname === "/choose-workspace" ? null : (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>
    );
  }

  const workspaceId = storedWorkspace ?? defaultWorkspaceId(capabilities, ctx);
  if (!isPosWorkspace(workspaceId)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>
    );
  }

  if (!pathBelongsToWorkspace(pathname, workspaceId)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">Loading…</div>
    );
  }

  return <>{children}</>;
}
