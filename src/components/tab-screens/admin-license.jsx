"use client";

import { useAuth } from "@/contexts/auth-context";
import { useAdminApi } from "@/contexts/admin-api-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { OrganizationBillingPanel } from "@/components/platform/organization-billing-panel";

export function AdminLicenseScreen() {
  const { organization: authOrganization, loading: authLoading, hasPermission, isSuperAdmin } = useAuth();
  const { organizationId: platformOrgId, organizationProfile } = useAdminApi();

  const canView =
    Boolean(platformOrgId) ||
    isSuperAdmin ||
    hasPermission?.("admin.license.view") ||
    hasPermission?.("admin.view");

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
      ) : !canView ? (
        <div className="theme-panel rounded-xl border p-6 text-sm text-slate-600 shadow-sm">
          You do not have permission to view License Information. Ask an organization administrator
          to grant <span className="font-mono text-xs">admin.license.view</span>.
        </div>
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
