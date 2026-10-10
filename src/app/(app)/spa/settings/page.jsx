"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { useAppRouter } from "@/lib/use-app-router";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { openAppPathAcrossWorkspaces } from "@/lib/workspace-navigation";

/** Salon setup now lives in Administration for SPA & Kinyozi organisations. */
export default function SpaSettingsRedirect() {
  const pathname = usePathname();
  const router = useAppRouter();
  const { user, organization, capabilities, isSuperAdmin, switchWorkspace } = useAuth();

  useEffect(() => {
    const ctx = buildAccessContext({
      user,
      organization,
      capabilities,
      requireTillFloat: resolveTillFloatNavFlag(capabilities),
      isSuperAdmin,
    });
    openAppPathAcrossWorkspaces({
      href: "/admin/spa-settings",
      currentPathname: pathname,
      userId: user?.id,
      organizationId: organization?.id,
      capabilities,
      ctx,
      currentWorkspaceId: getStoredWorkspace(),
      switchWorkspace,
      router,
    }).catch(() => {
      router.replace("/admin");
    });
  }, [capabilities, isSuperAdmin, organization, pathname, router, switchWorkspace, user]);

  return <p className="theme-subtext text-sm">Opening SPA & Kinyozi settings in Administration…</p>;
}
