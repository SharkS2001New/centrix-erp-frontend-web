"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminApiProvider } from "@/contexts/admin-api-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

export function PlatformAdminShell({ title, subtitle, children, breadcrumbTail = [] }) {
  const params = useParams();
  const router = useRouter();
  const orgId = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [organization, setOrganization] = useState(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(`/admin/organizations/${orgId}`);
      if (Boolean(res.effective_modules?.admin)) {
        router.replace(`/platform/organizations/${orgId}`);
        return;
      }
      setOrganization(res.organization ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load organization.");
    } finally {
      setLoading(false);
    }
  }, [orgId, router]);

  useEffect(() => {
    load();
  }, [load]);

  const apiPrefix = orgId ? `/admin/organizations/${orgId}` : "";

  return (
    <CatalogPageShell
      title={organization ? `${organization.org_name} — ${title}` : title}
      subtitle={subtitle}
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: organization?.org_name ?? "Organization", href: `/platform/organizations/${orgId}` },
          { label: "Platform admin", href: `/platform/organizations/${orgId}/admin` },
          ...breadcrumbTail,
        ]}
      />

      {loading ? (
        <p className="theme-subtext mt-6 text-sm">Loading…</p>
      ) : error ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : (
        <>
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            <p className="font-medium">Platform-managed administration</p>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/90">
              Administration is disabled for this tenant. You are managing branches, users, roles, and other
              setup tasks on their behalf.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium">
              <Link href={`/platform/organizations/${orgId}/admin`} className="text-[#185FA5] hover:underline">
                Admin hub
              </Link>
              <Link href={`/platform/organizations/${orgId}/settings`} className="text-[#185FA5] hover:underline">
                Organization settings
              </Link>
            </div>
          </div>

          <AdminApiProvider apiPrefix={apiPrefix} organizationId={orgId}>
            {children}
          </AdminApiProvider>
        </>
      )}
    </CatalogPageShell>
  );
}
