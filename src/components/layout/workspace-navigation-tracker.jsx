"use client";

import { useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { rememberWorkspacePath } from "@/lib/workspace-navigation";
import {
  resolveActiveWorkspace,
  resolveAvailableWorkspaces,
} from "@/lib/workspaces";

/** Persists the current route against the active workspace while the user navigates. */
export function WorkspaceNavigationTracker() {
  const pathname = usePathname();
  const { user, organization, capabilities, isSuperAdmin } = useAuth();

  const ctx = useMemo(
    () =>
      buildAccessContext({
        user,
        organization,
        capabilities,
        requireTillFloat: resolveTillFloatNavFlag(capabilities),
        isSuperAdmin,
      }),
    [capabilities, isSuperAdmin, organization, user],
  );

  const workspaces = useMemo(
    () => resolveAvailableWorkspaces(ctx, capabilities),
    [capabilities, ctx],
  );

  const workspaceId = useMemo(
    () => resolveActiveWorkspace(workspaces, getStoredWorkspace(), pathname)?.id ?? null,
    [workspaces, pathname],
  );

  useEffect(() => {
    if (!workspaceId || !user?.id || !pathname) return;
    rememberWorkspacePath(user.id, organization?.id, workspaceId, pathname);
  }, [organization?.id, pathname, user?.id, workspaceId]);

  return null;
}
