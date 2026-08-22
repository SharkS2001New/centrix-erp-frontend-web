"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import { AdminGuard } from "@/components/admin/admin-guard";
import { FinanceSettingsPanel } from "@/components/admin/finance-settings-panel";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { SettingsApiProvider } from "@/contexts/settings-api-context";
import { toastErrorSetter, toastMessageSetter } from "@/lib/notify";

/**
 * @param {{
 *   apiPrefix?: string,
 *   embedded?: boolean,
 *   showBreadcrumb?: boolean,
 * }} [props]
 */
export function AdminKraSettingsScreen({
  apiPrefix = "/erp/settings",
  embedded = false,
  showBreadcrumb = true,
} = {}) {
  const [saving, setSaving] = useState(false);
  const setMessage = toastMessageSetter;
  const setError = toastErrorSetter;

  const body = (
    <SettingsApiProvider apiPrefix={apiPrefix}>
      <CatalogPageShell
        title="KRA settings"
        subtitle="On-prem fiscal device connection and when completed sales are signed through KRA."
        banner={
          showBreadcrumb && !embedded ? (
            <AdminBreadcrumb
              items={[
                { label: "Administration", href: "/admin" },
                { label: "KRA settings" },
              ]}
            />
          ) : null
        }
      >
        <FinanceSettingsPanel
          mode="kra"
          title="KRA tax receipts"
          subtitle="Connect your on-prem KRA fiscal device and choose when completed sales are signed through it."
          saving={saving}
          setSaving={setSaving}
          setError={setError}
          setMessage={setMessage}
        />
      </CatalogPageShell>
    </SettingsApiProvider>
  );

  if (embedded) return body;
  return <AdminGuard settingsOnly>{body}</AdminGuard>;
}

/** Platform org-scoped wrapper — uses route org id for settings API. */
export function PlatformAdminKraSettingsScreen() {
  const params = useParams();
  const orgId = params?.id;
  const apiPrefix = orgId ? `/admin/organizations/${orgId}/settings` : "/erp/settings";
  return <AdminKraSettingsScreen apiPrefix={apiPrefix} embedded showBreadcrumb={false} />;
}
