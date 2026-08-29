"use client";

import { AdminMpesaSettingsScreen } from "@/components/tab-screens/admin-mpesa-settings";
import { useAuth } from "@/contexts/auth-context";
import {
  PaymentsAccessGate,
  PaymentsEmptyState,
  PaymentsSettingsBreadcrumb,
} from "@/components/centrix-payments/centrix-payments-shared";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { P } from "@/lib/permission-codes";
import { canAccessCentrixPaymentsConfiguration } from "@/lib/platform-org-features";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";

export function CentrixPaymentsMpesaSettingsScreen() {
  const { user, capabilities, hasPermission } = useAuth();
  const canConfigure = canAccessCentrixPaymentsConfiguration({
    user,
    capabilities,
    hasPermission,
  });

  useTabTitle(tabSectionTitle("M-Pesa Daraja", "Centrix Payments"));

  return (
    <PaymentsAccessGate
      permissionAny={[P.centrix_payments.settings.view, P.centrix_payments.settings.edit]}
      title="M-Pesa Daraja"
    >
      <CatalogPageShell
        title="M-Pesa Daraja"
        subtitle="Safaricom consumer key, secret, STK push defaults, and organization-wide M-Pesa behaviour."
        banner={<PaymentsSettingsBreadcrumb title="M-Pesa Daraja" />}
      >
        {!canConfigure ? (
          <PaymentsEmptyState
            title="Insufficient permissions"
            description="Ask an administrator to grant Centrix Payments settings access on your role."
          />
        ) : (
          <AdminMpesaSettingsScreen embedded showBreadcrumb={false} hidePageHeader />
        )}
      </CatalogPageShell>
    </PaymentsAccessGate>
  );
}
