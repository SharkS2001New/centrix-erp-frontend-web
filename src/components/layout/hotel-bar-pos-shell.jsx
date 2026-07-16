"use client";

import { Suspense, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { workspaceLandingPath } from "@/lib/workspace-navigation";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { buildAccessContext, isPlatformShellUser, resolveTillFloatNavFlag } from "@/lib/access-control";
import {
  defaultWorkspaceId,
  needsWorkspaceSelection,
  pathBelongsToWorkspace,
  workspaceHomePath,
} from "@/lib/workspaces";
import { PasswordExpiryGuard } from "@/components/auth/password-expiry-guard";
import { LicenseExpiryGuard } from "@/components/auth/license-expiry-guard";
import { WorkspaceNavigationTracker } from "@/components/layout/workspace-navigation-tracker";
import { NetworkStatusBanner } from "@/components/shared/network-status-banner";
import { LicenseExpiryBanner } from "@/components/shared/license-expiry-banner";
import { AuthGuard } from "@/components/auth-guard";

function HotelBarPosWorkspaceGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organization, capabilities, loading, isSuperAdmin } = useAuth();

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

    if (workspaceId !== "hotel_bar_pos") {
      router.replace(
        workspaceLandingPath(user?.id, organization?.id, workspaceId, capabilities, ctx),
      );
      return;
    }

    if (!pathBelongsToWorkspace(pathname, workspaceId)) {
      const landingPath = workspaceHomePath(workspaceId, capabilities);
      if (pathname !== landingPath) {
        router.replace(landingPath);
      }
    }
  }, [capabilities, ctx, loading, organization?.id, pathname, platformUser, router, storedWorkspace, user?.id]);

  return <>{children}</>;
}

export function HotelBarPosShell({ children }) {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <LicenseExpiryGuard>
          <PasswordExpiryGuard>
            <HotelBarPosWorkspaceGuard>
              <WorkspaceNavigationTracker />
              <div className="flex h-screen min-h-0 flex-col overflow-hidden app-main-bg">
                <NetworkStatusBanner />
                <LicenseExpiryBanner />
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
              </div>
            </HotelBarPosWorkspaceGuard>
          </PasswordExpiryGuard>
        </LicenseExpiryGuard>
      </Suspense>
    </AuthGuard>
  );
}
