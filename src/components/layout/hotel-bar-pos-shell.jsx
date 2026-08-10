"use client";

import { Suspense, useEffect, useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import {
  defaultWorkspaceId,
  needsWorkspaceSelection,
  workspaceLandingPath,
} from "@/lib/workspace-navigation";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { buildAccessContext, isPlatformShellUser, resolveTillFloatNavFlag } from "@/lib/access-control";
import {
  pathBelongsToWorkspace,
  workspaceHomePath,
} from "@/lib/workspaces";
import { PasswordExpiryGuard } from "@/components/auth/password-expiry-guard";
import { LicenseExpiryGuard } from "@/components/auth/license-expiry-guard";
import { HotelBarPosAuthGuard } from "@/components/auth/hotel-bar-pos-auth-guard";
import { WorkspaceNavigationTracker } from "@/components/layout/workspace-navigation-tracker";
import { NetworkStatusBanner } from "@/components/shared/network-status-banner";
import { LicenseExpiryBanner } from "@/components/shared/license-expiry-banner";

function HotelBarPosWorkspaceGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, organization, capabilities, loading, isSuperAdmin } = useAuth();

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
    if (workspaceId !== "hotel_bar_pos") return "redirect-landing";
    if (!pathBelongsToWorkspace(pathname, workspaceId)) return "redirect-home";
    return "allow";
  }, [capabilities, ctx, loading, pathname, platformUser, storedWorkspace]);

  useEffect(() => {
    if (loading || platformUser) return;

    if (accessState === "redirect-workspace") {
      if (pathname !== "/choose-workspace") {
        router.replace("/choose-workspace");
      }
      return;
    }

    const workspaceId = storedWorkspace ?? defaultWorkspaceId(capabilities, ctx);
    if (!workspaceId) return;

    if (accessState === "redirect-landing") {
      router.replace(
        workspaceLandingPath(user?.id, organization?.id, workspaceId, capabilities, ctx),
      );
      return;
    }

    if (accessState === "redirect-home") {
      const landingPath = workspaceHomePath(workspaceId, capabilities);
      if (pathname !== landingPath) {
        router.replace(landingPath);
      }
    }
  }, [
    accessState,
    capabilities,
    ctx,
    loading,
    organization?.id,
    pathname,
    platformUser,
    router,
    storedWorkspace,
    user?.id,
  ]);

  if (loading || accessState === "wait") {
    return (
      <div className="flex h-full items-center justify-center bg-slate-100 text-slate-600">
        Loading…
      </div>
    );
  }

  if (accessState !== "allow") return null;

  return <>{children}</>;
}

export function HotelBarPosShell({ children }) {
  return (
    <HotelBarPosAuthGuard>
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
    </HotelBarPosAuthGuard>
  );
}
