"use client";

import { useAuth } from "@/contexts/auth-context";
import { useAdminApi } from "@/contexts/admin-api-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { OrganizationBillingPanel } from "@/components/platform/organization-billing-panel";

export default function AdminLicensePage() {
  const { organization: authOrganization, loading: authLoading } = useAuth();
  const { organizationId: platformOrgId, organizationProfile } = useAdminApi();

  const orgId = platformOrgId || authOrganization?.id || null;
  const orgName =
    organizationProfile?.org_name ||
    authOrganization?.org_name ||
    "Your organization";

  return (
    <CatalogPageShell
      title="License Information"
      subtitle="Plan, attached invoice, and contract documents for this organization."
    >
      <AdminBreadcrumb
        items={[
          { label: "Administration", href: "/admin" },
          { label: "License Information" },
        ]}
      />

      {authLoading && !platformOrgId ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <div className="theme-panel space-y-8 rounded-xl border p-6 shadow-sm">
          <OrganizationBillingPanel
            organizationId={orgId}
            organization={{ org_name: orgName, id: orgId }}
            mode={platformOrgId ? "platform" : "tenant"}
            showInvoice
            showRevoke={Boolean(platformOrgId)}
          />
        </div>
      )}
    </CatalogPageShell>
  );
}
