"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import {
  canAccessOrgAdminSettings,
  isAdministrationModuleEnabled,
  shouldHideOrgAdminFromPlatformSuperAdmin,
} from "@/lib/admin-scope";
import { buildAccessContext, resolveHomePath } from "@/lib/access-control";

export function AdminGuard({ children, strict = false }) {
  const { user, organization, capabilities, loading, hasPermission, isSuperAdmin } = useAuth();
  const router = useRouter();

  const platformShellBlock = shouldHideOrgAdminFromPlatformSuperAdmin({ organization, isSuperAdmin });
  const administrationEnabled = isAdministrationModuleEnabled(capabilities);

  const isAdmin = user?.is_admin || capabilities?.is_admin;
  const canAccess = platformShellBlock
    ? false
    : strict
      ? isAdmin
      : isAdmin ||
        hasPermission("admin.overview.view") ||
        hasPermission("admin.manage") ||
        canAccessOrgAdminSettings({
          organization,
          isSuperAdmin,
          hasPermission,
          user,
          capabilities,
        });

  useEffect(() => {
    if (!loading && !canAccess && !platformShellBlock && administrationEnabled) {
      router.replace(
        resolveHomePath(
          buildAccessContext({
            user,
            organization,
            capabilities,
            isSuperAdmin,
          }),
        ),
      );
    }
  }, [
    administrationEnabled,
    canAccess,
    capabilities,
    isSuperAdmin,
    loading,
    organization,
    platformShellBlock,
    router,
    user,
  ]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }

  if (platformShellBlock) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        <h2 className="font-medium">Organization administration</h2>
        <p className="mt-2">
          Tenant administration (company profile, branches, users, roles, and system preferences) is configured
          inside each provisioned organization — not from the platform shell account. Register tenants and manage
          module access from Platform administration.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/platform"
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#144f8a]"
          >
            Platform administration
          </Link>
          <Link
            href="/platform/organizations/new"
            className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm text-amber-900 hover:bg-amber-100"
          >
            Register organization
          </Link>
        </div>
      </div>
    );
  }

  if (!administrationEnabled) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-950">
        <h2 className="font-medium">Administration is not available</h2>
        <p className="mt-2">
          The Administration application is disabled for this organization. Company setup, users, roles, branches,
          and organization settings are managed by your platform operator instead.
        </p>
        <p className="mt-2 text-xs text-amber-800">
          Contact your platform support team if you need changes to users, branches, or system preferences.
        </p>
      </div>
    );
  }

  if (!canAccess) return null;

  return <>{children}</>;
}
