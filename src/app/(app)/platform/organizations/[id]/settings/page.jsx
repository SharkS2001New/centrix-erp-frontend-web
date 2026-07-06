"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { OrganizationSettingsContent } from "@/components/admin/organization-settings-content";
import { SettingsApiProvider } from "@/contexts/settings-api-context";
import { capabilitiesFromOrganizationPayload } from "@/lib/org-settings-tabs";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

export default function PlatformOrganizationSettingsPage() {
  const params = useParams();
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
      setOrganization(res.organization ?? null);
      setOrgPayload(res);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load organization.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

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
      subtitle="Platform configuration for module provisioning, order workflow, integration gates, and legacy archive. Tenants manage operational module preferences under Administration → Organization settings."
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
          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800">
            <p className="font-medium">Platform-managed organization settings</p>
            <p className="mt-1 text-xs text-slate-600">
              Module provisioning, checkout flow, mobile orders, order pipeline, M-Pesa/KRA/AI feature toggles,
              and legacy archive are maintained here. Tenants manage day-to-day module preferences under
              Administration → Organization settings.
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
              onAfterSave={load}
              breadcrumbItems={null}
              showShell={false}
            />
          </SettingsApiProvider>
        </>
      )}
    </CatalogPageShell>
  );
}
