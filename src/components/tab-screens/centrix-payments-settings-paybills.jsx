"use client";

import { AdminMpesaPaybillsScreen } from "@/components/tab-screens/admin-mpesa-paybills";
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

export function CentrixPaymentsPaybillsSettingsScreen() {
  const { user, capabilities, hasPermission } = useAuth();
  const canConfigure = canAccessCentrixPaymentsConfiguration({
    user,
    capabilities,
    hasPermission,
  });

  useTabTitle(tabSectionTitle("Paybills & tills", "Centrix Payments"));

  return (
    <PaymentsAccessGate
      permissionAny={[
        P.centrix_payments.mpesa.view,
        P.centrix_payments.mpesa.manage,
        P.centrix_payments.accounts.view,
      ]}
      title="Paybills & tills"
    >
      <CatalogPageShell
        title="Paybills & tills"
        subtitle="Shortcodes, tills, and branch or route routing for Lipa na M-Pesa collections."
        banner={<PaymentsSettingsBreadcrumb title="Paybills & tills" />}
      >
        {!canConfigure ? (
          <PaymentsEmptyState
            title="Insufficient permissions"
            description="Ask an administrator to grant paybill management access on your role."
          />
        ) : (
          <AdminMpesaPaybillsScreen embedded showBreadcrumb={false} hidePageHeader />
        )}
      </CatalogPageShell>
    </PaymentsAccessGate>
  );
}
