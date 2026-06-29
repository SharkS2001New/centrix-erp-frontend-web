"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { ProfilePanel } from "@/components/layout/profile-panel";
import { buildAccessContext, resolveTillFloatNavFlag } from "@/lib/access-control";
import { getStoredWorkspace } from "@/lib/auth-storage";
import {
  needsWorkspaceSelection,
  resolveAvailableWorkspaces,
  resolvePostLoginPath,
} from "@/lib/workspaces";

export default function ProfilePage() {
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
  const workspaces = resolveAvailableWorkspaces(ctx, capabilities);
  const workspaceSelectionRequired = needsWorkspaceSelection(capabilities, storedWorkspace, ctx);
  const continueHref = workspaceSelectionRequired
    ? "/choose-workspace"
    : resolvePostLoginPath(ctx, capabilities);

  useEffect(() => {
    if (loading || user?.must_change_password || !capabilities) return;
    if (workspaceSelectionRequired) {
      router.replace("/choose-workspace");
    }
  }, [capabilities, loading, router, user?.must_change_password, workspaceSelectionRequired]);

  return (
    <CatalogPageShell
      title="My profile"
      subtitle="Account details and security."
      action={
        !user?.must_change_password && workspaces.length > 0 ? (
          <PrimaryButton type="button" onClick={() => router.push(continueHref)}>
            Continue to applications
          </PrimaryButton>
        ) : null
      }
    >
      <AdminBreadcrumb items={[{ label: "Profile" }]} />
      {!user?.must_change_password && workspaces.length > 1 ? (
        <p className="mt-4 text-sm text-slate-600">
          Choose an application to continue working.{" "}
          <Link href="/choose-workspace" className="font-medium text-[#185FA5] hover:underline">
            Open application picker
          </Link>
        </p>
      ) : null}
      <div className="mt-6">
        <ProfilePanel />
      </div>
    </CatalogPageShell>
  );
}
