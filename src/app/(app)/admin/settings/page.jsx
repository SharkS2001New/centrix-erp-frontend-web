"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminGuard } from "@/components/admin/admin-guard";
import { OrganizationSettingsContent } from "@/components/admin/organization-settings-content";
import { SettingsApiProvider } from "@/contexts/settings-api-context";
import { useAuth } from "@/contexts/auth-context";
import { TENANT_ORG_SETTINGS_SUBTITLE } from "@/lib/org-settings-access";

export default function AdminSettingsPage() {
  const { capabilities, refreshCapabilities } = useAuth();

  return (
    <AdminGuard settingsOnly>
      <SettingsApiProvider apiPrefix="/erp/settings">
        <OrganizationSettingsContent
          capabilities={capabilities}
          onAfterSave={() => refreshCapabilities({ force: true })}
          tenantSelfService
          breadcrumbItems={[
            { label: "Administration", href: "/admin" },
            { label: "Organization settings" },
          ]}
          title="Organization settings"
          subtitle={TENANT_ORG_SETTINGS_SUBTITLE}
        />
      </SettingsApiProvider>
    </AdminGuard>
  );
}
