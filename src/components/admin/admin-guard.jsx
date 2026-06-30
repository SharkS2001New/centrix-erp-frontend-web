"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import {
  canAccessOrgAdminSettings,
  canAccessTenantOrganizationSettings,
  isAdministrationModuleEnabled,
  shouldHideOrgAdminFromPlatformSuperAdmin,
} from "@/lib/admin-scope";
import { buildAccessContext, resolveHomePath } from "@/lib/access-control";
import { hasAuthSession, readCachedAuthSnapshot } from "@/lib/auth-storage";

export function AdminGuard({ children, strict = false, settingsOnly = false }) {
  const { user, organization, capabilities, loading, hasPermission, isSuperAdmin } = useAuth();
  const router = useRouter();

  const cached = readCachedAuthSnapshot();
  const effectiveUser = user ?? cached?.user ?? null;
  const effectiveOrganization = organization ?? cached?.organization ?? null;
  const effectiveCapabilities = capabilities ?? cached?.capabilities ?? null;
  const sessionReady = Boolean(effectiveUser) || hasAuthSession();

  const platformShellBlock = shouldHideOrgAdminFromPlatformSuperAdmin({
    organization: effectiveOrganization,
    isSuperAdmin,
  });
  const administrationEnabled = isAdministrationModuleEnabled(effectiveCapabilities);

  const accessCtx = useMemo(
    () =>
      buildAccessContext({
        user: effectiveUser,
        organization: effectiveOrganization,
        capabilities: effectiveCapabilities,
        isSuperAdmin,
      }),
    [effectiveCapabilities, effectiveOrganization, effectiveUser, isSuperAdmin],
  );

  const isAdmin = effectiveUser?.is_admin || effectiveCapabilities?.is_admin;
  const canAccessSettings = canAccessTenantOrganizationSettings({
    organization: effectiveOrganization,
    isSuperAdmin,
    hasPermission: accessCtx.hasPermission,
    user: effectiveUser,
    capabilities: effectiveCapabilities,
  });
  const canAccess = platformShellBlock
    ? false
    : strict
      ? isAdmin
      : isAdmin ||
        accessCtx.hasPermission("admin.overview.view") ||
        accessCtx.hasPermission("admin.manage") ||
        canAccessOrgAdminSettings({
          organization: effectiveOrganization,
          isSuperAdmin,
          hasPermission: accessCtx.hasPermission,
          user: effectiveUser,
          capabilities: effectiveCapabilities,
        });

  const canEnter = settingsOnly ? canAccessSettings : canAccess;

  useEffect(() => {
    if (loading && !sessionReady) return;
    if (!canEnter && !platformShellBlock && (administrationEnabled || settingsOnly)) {
      router.replace(resolveHomePath(accessCtx));
    }
  }, [
    accessCtx,
    administrationEnabled,
    canEnter,
    loading,
    platformShellBlock,
    router,
    sessionReady,
    settingsOnly,
  ]);

  if (loading && !sessionReady) {
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

  if (!administrationEnabled && !settingsOnly) {
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

  if (!canEnter) return null;

  return <>{children}</>;
}
