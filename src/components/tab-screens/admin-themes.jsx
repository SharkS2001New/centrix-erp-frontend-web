"use client";

import { useState } from "react";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminGuard } from "@/components/admin/admin-guard";
import { ExternalPosSettingsPanel } from "@/components/admin/external-pos-settings-panel";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { SettingsApiProvider } from "@/contexts/settings-api-context";
import { useAuth } from "@/contexts/auth-context";
import { isDrivingIndustry, isHospitalityIndustry, isSpaIndustry } from "@/lib/org-settings-tabs";
import { toastErrorSetter, toastMessageSetter } from "@/lib/notify";

export function AdminThemesScreen() {
  const { capabilities } = useAuth();
  const [saving, setSaving] = useState(false);
  const setMessage = toastMessageSetter;
  const setError = toastErrorSetter;
  const isHospitality = isHospitalityIndustry(capabilities);
  const isSpa = isSpaIndustry(capabilities);
  const isDriving = isDrivingIndustry(capabilities);

  return (
    <AdminGuard settingsOnly>
      <SettingsApiProvider apiPrefix="/erp/settings">
        <CatalogPageShell
          title="Centrix ERP Themes"
          subtitle={
            isSpa
              ? "Sidebar, search, buttons, and form fields for SPA & Kinyozi and Administration."
              : isDriving
                ? "Sidebar, search, buttons, and form fields for Driving School and Administration."
              : isHospitality
                ? "Color palette for the ERP sidebar and primary buttons across Hotel Backoffice and Admin."
                : "Color palette for the ERP sidebar and primary buttons. Classic External POS can use the full theme palette."
          }
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
