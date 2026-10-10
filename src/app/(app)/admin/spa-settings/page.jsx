"use client";

import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminGuard } from "@/components/admin/admin-guard";
import { SettingsScreen } from "@/components/spa/screens/settings";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { useAuth } from "@/contexts/auth-context";
import { isSpaIndustry } from "@/lib/org-settings-tabs";
import { SpaProvider } from "@/lib/spa/store";

export default function SpaSettingsPage() {
  const { capabilities } = useAuth();

  return (
    <AdminGuard settingsOnly>
      <CatalogPageShell
        title="SPA & Kinyozi"
        subtitle="Business type, hours, receipt, tax, payments, and salon users for this organisation."
        banner={
          <AdminBreadcrumb
            items={[
              { label: "Administration", href: "/admin" },
              { label: "SPA & Kinyozi" },
            ]}
          />
        }
      >
        {isSpaIndustry(capabilities) ? (
          <SpaProvider>
            <SettingsScreen embedded />
          </SpaProvider>
        ) : (
          <p className="theme-subtext text-sm">These settings are available when the organisation industry is SPA & Kinyozi.</p>
        )}
      </CatalogPageShell>
    </AdminGuard>
  );
}
