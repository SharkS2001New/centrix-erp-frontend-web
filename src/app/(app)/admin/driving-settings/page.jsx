"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminGuard } from "@/components/admin/admin-guard";
import { SettingsScreen } from "@/components/driving/screens";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { useAuth } from "@/contexts/auth-context";
import { isDrivingIndustry } from "@/lib/org-settings-tabs";

export default function DrivingSettingsPage() {
  const { capabilities } = useAuth();

  return (
    <AdminGuard settingsOnly>
      <CatalogPageShell
        title="Driving School"
        subtitle="School name, lesson reminders, and the tools this school uses. Branches and users stay on their Administration pages."
        banner={
          <AdminBreadcrumb
            items={[
              { label: "Administration", href: "/admin" },
              { label: "Driving School" },
            ]}
          />
        }
      >
        {isDrivingIndustry(capabilities) ? (
          <SettingsScreen embedded />
        ) : (
          <p className="theme-subtext text-sm">These settings are available when the organisation industry is Driving School.</p>
        )}
      </CatalogPageShell>
    </AdminGuard>
  );
}
