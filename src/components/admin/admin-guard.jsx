"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import {
  canAccessOrgAdminSettings,
  shouldHideOrgAdminFromPlatformSuperAdmin,
} from "@/lib/admin-scope";

const PLATFORM_ALLOWED_PREFIXES = ["/admin/organizations/new"];

function isPlatformAllowedPath(pathname) {
  return PLATFORM_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function AdminGuard({ children, strict = false }) {
  const pathname = usePathname();
  const { user, organization, capabilities, loading, hasPermission, isSuperAdmin } = useAuth();
  const router = useRouter();

  const platformShellBlock =
    shouldHideOrgAdminFromPlatformSuperAdmin({ organization, isSuperAdmin }) &&
    !isPlatformAllowedPath(pathname ?? "");

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
    if (!loading && !canAccess && !platformShellBlock) {
      router.replace("/dashboard");
    }
  }, [canAccess, loading, platformShellBlock, router]);

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
          inside each provisioned organization — not from the platform shell account.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/platform"
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#144f8a]"
          >
            Platform administration
          </Link>
          <Link
            href="/admin/organizations/new"
            className="rounded-lg border border-amber-300 bg-white px-4 py-2 text-sm text-amber-900 hover:bg-amber-100"
          >
            Provision organization
          </Link>
        </div>
      </div>
    );
  }

  if (!canAccess) return null;

  return <>{children}</>;
}
