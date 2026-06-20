"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { OrganizationSettingsContent } from "@/components/admin/organization-settings-content";
import { SettingsApiProvider } from "@/contexts/settings-api-context";
import { capabilitiesFromOrganizationPayload } from "@/lib/org-settings-tabs";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

export default function PlatformOrganizationSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [orgPayload, setOrgPayload] = useState(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(`/admin/organizations/${orgId}`);
      const administrationEnabled = Boolean(res.effective_modules?.admin);
      if (administrationEnabled) {
        router.replace(`/platform/organizations/${orgId}`);
        return;
      }
      setOrganization(res.organization ?? null);
      setOrgPayload(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load organization.");
    } finally {
      setLoading(false);
    }
  }, [orgId, router]);

  useEffect(() => {
    load();
  }, [load]);

  const capabilities = useMemo(
    () => capabilitiesFromOrganizationPayload(orgPayload ?? {}),
    [orgPayload],
  );

  const apiPrefix = orgId ? `/admin/organizations/${orgId}/settings` : "/erp/settings";

  return (
    <CatalogPageShell
      title={organization ? `${organization.org_name} — settings` : "Organization settings"}
      subtitle="Manage operational preferences on behalf of this organization. Administration is disabled, so tenant managers cannot access these settings."
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: organization?.org_name ?? "Organization", href: `/platform/organizations/${orgId}` },
          { label: "Organization settings" },
        ]}
      />

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : (
        <>
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-950">
            <p className="font-medium">Administration is disabled for this organization</p>
            <p className="mt-1 text-xs text-amber-800">
              Tenant managers cannot open Administration → Organization settings. You are configuring checkout,
              finance, notifications, and other preferences on their behalf from the platform.
            </p>
            <Link
              href={`/platform/organizations/${orgId}`}
              className="mt-3 inline-block text-xs font-medium text-[#185FA5] hover:underline"
            >
              Back to organization configuration
            </Link>
          </div>

          <SettingsApiProvider apiPrefix={apiPrefix}>
            <OrganizationSettingsContent
              capabilities={capabilities}
              platformManaged
              breadcrumbItems={null}
              showShell={false}
            />
          </SettingsApiProvider>
        </>
      )}
    </CatalogPageShell>
  );
}
