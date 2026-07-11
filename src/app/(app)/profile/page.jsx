"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { ProfilePanel } from "@/components/layout/profile-panel";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import { resolveProfileExitPath } from "@/lib/post-auth-navigation";
import { isPasswordExpiryForced } from "@/lib/security-settings";
import {
  needsWorkspaceSelection,
  resolveAvailableWorkspaces,
} from "@/lib/workspaces";

export default function ProfilePage() {
  const router = useRouter();
  const {
    user,
    organization,
    capabilities,
    passwordExpiry,
    loading,
    isSuperAdmin,
    refreshCapabilities,
  } = useAuth();

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

  const passwordLocked =
    Boolean(user?.must_change_password) || isPasswordExpiryForced(user, passwordExpiry);
  const workspaces = resolveAvailableWorkspaces(ctx, capabilities);
  const storedWorkspace = getStoredWorkspace();
  const workspaceSelectionRequired = needsWorkspaceSelection(capabilities, storedWorkspace, ctx);
  const exitPath = resolveProfileExitPath(ctx, capabilities);
  const canLeaveProfile = !passwordLocked;

  useEffect(() => {
    if (loading || passwordLocked || !capabilities) return;
    if (workspaces.length === 0 && !ctx.platformShell) {
      refreshCapabilities().catch(() => {});
    }
  }, [capabilities, ctx.platformShell, loading, passwordLocked, refreshCapabilities, workspaces.length]);

  useEffect(() => {
    if (loading || passwordLocked || !capabilities) return;
    if (workspaceSelectionRequired) {
      router.replace("/choose-workspace");
    }
  }, [capabilities, loading, passwordLocked, router, workspaceSelectionRequired]);

  return (
    <CatalogPageShell
      title="My profile"
      subtitle={
        passwordLocked
          ? "Update your password to unlock the rest of the application."
          : "Account details and security. You can also enable two-factor authentication (email or Google Authenticator) below."
      }
      action={
        canLeaveProfile ? (
          <PrimaryButton
            type="button"
            showIcon={false}
            onClick={() => router.push(exitPath)}
          >
            {exitPath === "/choose-workspace" ? "Choose application" : "Continue to applications"}
          </PrimaryButton>
        ) : null
      }
    >
      <AdminBreadcrumb items={[{ label: "Profile" }]} />

      {passwordLocked ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Set a new password below to continue into your applications.
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          Return to your work area.{" "}
          <Link href={exitPath} className="font-medium text-[#185FA5] hover:underline">
            {exitPath === "/choose-workspace" ? "Open application picker" : "Continue to applications"}
          </Link>
        </div>
      )}

      <div className="mt-6">
        <ProfilePanel />
      </div>
    </CatalogPageShell>
  );
}
