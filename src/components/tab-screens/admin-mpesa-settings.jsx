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
export function AdminMpesaSettingsScreen({
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
        title="M-Pesa settings"
        subtitle="Organization Daraja defaults and saved paybills. Use the tabs to switch between defaults and the paybill list."
        banner={
          showBreadcrumb && !embedded ? (
            <AdminBreadcrumb
              items={[
                { label: "Administration", href: "/admin" },
                { label: "M-Pesa settings" },
              ]}
            />
          ) : null
        }
      >
        <FinanceSettingsPanel
          mode="mpesa"
          title="M-Pesa payments"
          subtitle="Set up Safaricom Daraja for paybill, till, and STK push at checkout."
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

export function PlatformAdminMpesaSettingsScreen() {
  const params = useParams();
  const orgId = params?.id;
  const apiPrefix = orgId ? `/admin/organizations/${orgId}/settings` : "/erp/settings";
  return <AdminMpesaSettingsScreen apiPrefix={apiPrefix} embedded showBreadcrumb={false} />;
}
