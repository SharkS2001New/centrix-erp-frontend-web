"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { rememberWorkspacePath } from "@/lib/workspace-navigation";

/** Persists the current route against the active workspace while the user navigates. */
export function WorkspaceNavigationTracker() {
  const pathname = usePathname();
  const { user, organization } = useAuth();
  const workspaceId = getStoredWorkspace();

  useEffect(() => {
    if (!workspaceId || !user?.id) return;
    rememberWorkspacePath(user.id, organization?.id, workspaceId, pathname);
  }, [organization?.id, pathname, user?.id, workspaceId]);

  return null;
}
