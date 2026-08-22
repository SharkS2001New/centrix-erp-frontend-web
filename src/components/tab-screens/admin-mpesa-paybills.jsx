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
export function AdminMpesaPaybillsScreen({
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
        title="M-Pesa Paybills"
        subtitle="Paybill and till shortcodes for routes and shops. Shortcodes are unique across organizations."
        banner={
          showBreadcrumb && !embedded ? (
            <AdminBreadcrumb
              items={[
                { label: "Administration", href: "/admin" },
                { label: "M-Pesa Paybills" },
              ]}
            />
          ) : null
        }
      >
        <FinanceSettingsPanel
          mode="paybills"
          title="Paybills for routes & shops"
          subtitle="Assign Safaricom paybill / till shortcodes to routes or shops."
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

export function PlatformAdminMpesaPaybillsScreen() {
  const params = useParams();
  const orgId = params?.id;
  const apiPrefix = orgId ? `/admin/organizations/${orgId}/settings` : "/erp/settings";
  return <AdminMpesaPaybillsScreen apiPrefix={apiPrefix} embedded showBreadcrumb={false} />;
}
