"use client";

import { useAuth } from "@/contexts/auth-context";
import { SettingsApiProvider } from "@/contexts/settings-api-context";
import { OrganizationSettingsContent } from "@/components/admin/organization-settings-content";

export default function AdminSettingsPage() {
  const { refreshCapabilities, capabilities } = useAuth();

  return (
    <SettingsApiProvider>
      <OrganizationSettingsContent
        capabilities={capabilities}
        onAfterSave={refreshCapabilities}
        breadcrumbItems={[{ label: "Administration", href: "/admin" }, { label: "Organization settings" }]}
      />
    </SettingsApiProvider>
  );
}
