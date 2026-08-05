"use client";

import { useState } from "react";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminGuard } from "@/components/admin/admin-guard";
import { ExternalPosSettingsPanel } from "@/components/admin/external-pos-settings-panel";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { SettingsApiProvider } from "@/contexts/settings-api-context";
import { useAuth } from "@/contexts/auth-context";
import { toastErrorSetter, toastMessageSetter } from "@/lib/notify";

export function AdminThemesScreen() {
  const { capabilities } = useAuth();
  const [saving, setSaving] = useState(false);
  const setMessage = toastMessageSetter;
  const setError = toastErrorSetter;

  return (
    <AdminGuard settingsOnly>
      <SettingsApiProvider apiPrefix="/erp/settings">
        <CatalogPageShell
          title="Centrix ERP Themes"
          subtitle="Color palette for the ERP sidebar and primary buttons. Classic External POS can use the full theme palette."
          banner={
            <AdminBreadcrumb
              items={[
                { label: "Administration", href: "/admin" },
                { label: "Centrix ERP Themes" },
              ]}
            />
          }
        >
          <ExternalPosSettingsPanel
            capabilities={capabilities}
            saving={saving}
            setSaving={setSaving}
            setError={setError}
            setMessage={setMessage}
          />
        </CatalogPageShell>
      </SettingsApiProvider>
    </AdminGuard>
  );
}
