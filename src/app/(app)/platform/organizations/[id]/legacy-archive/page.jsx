"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { LegacyArchiveSettingsPanel } from "@/components/admin/legacy-archive-settings-panel";
import { SettingsApiProvider } from "@/contexts/settings-api-context";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { toastErrorSetter, toastMessageSetter } from "@/lib/notify";

export default function PlatformOrganizationLegacyArchivePage() {
  const params = useParams();
  const orgId = params?.id;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [organization, setOrganization] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(`/admin/organizations/${orgId}`);
      setOrganization(res.organization ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load organization.");
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const apiPrefix = orgId ? `/admin/organizations/${orgId}/settings` : "/erp/settings";

  const panelProps = {
    saving,
    setSaving,
    setError: toastErrorSetter,
    setMessage: toastMessageSetter,
    onAfterSave: load,
    platformManaged: true,
  };

  return (
    <CatalogPageShell
      title={organization ? `${organization.org_name} — legacy archive` : "Legacy archive"}
      subtitle="Enable LightStores historical sales for this tenant and configure the cutover date shown in Reports → Legacy archive."
    >
      <AdminBreadcrumb
        items={[
          { label: "Platform", href: "/platform" },
          { label: organization?.org_name ?? "Organization", href: `/platform/organizations/${orgId}` },
          { label: "Legacy archive" },
        ]}
      />

      {loading ? (
        <p className="mt-6 text-sm text-slate-500">Loading…</p>
      ) : error ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      ) : (
        <>
          <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-800">
            <p className="font-medium">Platform-managed legacy archive</p>
            <p className="mt-1 text-xs text-slate-600">
              Turn on read-only LightStores sales history for this organization. Tenants browse imported sales
              under Reports → Legacy archive once enabled.
            </p>
            <Link
              href={`/platform/organizations/${orgId}`}
              className="mt-3 inline-block text-xs font-medium text-[#185FA5] hover:underline"
            >
              Back to organization configuration
            </Link>
          </div>

          <SettingsApiProvider apiPrefix={apiPrefix}>
            <LegacyArchiveSettingsPanel {...panelProps} />
          </SettingsApiProvider>
        </>
      )}
    </CatalogPageShell>
  );
}
