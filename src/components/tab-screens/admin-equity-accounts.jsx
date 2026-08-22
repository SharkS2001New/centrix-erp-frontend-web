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
export function AdminEquityAccountsScreen({
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
        title="Equity Bank accounts"
        subtitle="Organization Equity defaults and saved accounts. Select an account to set its own callback URL and shared secret."
        banner={
          showBreadcrumb && !embedded ? (
            <AdminBreadcrumb
              items={[
                { label: "Administration", href: "/admin" },
                { label: "Equity Bank accounts" },
              ]}
            />
          ) : null
        }
      >
        <FinanceSettingsPanel
          mode="equity"
          title="Equity Bank"
          subtitle="Enable paybill reconciliation and manage Equity accounts for routes."
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

export function PlatformAdminEquityAccountsScreen() {
  const params = useParams();
  const orgId = params?.id;
  const apiPrefix = orgId ? `/admin/organizations/${orgId}/settings` : "/erp/settings";
  return <AdminEquityAccountsScreen apiPrefix={apiPrefix} embedded showBreadcrumb={false} />;
}
