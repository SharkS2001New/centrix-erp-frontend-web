"use client";

import { AdminEquityAccountsScreen } from "@/components/tab-screens/admin-equity-accounts";
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

export function CentrixPaymentsEquitySettingsScreen() {
  const { user, capabilities, hasPermission } = useAuth();
  const canConfigure = canAccessCentrixPaymentsConfiguration({
    user,
    capabilities,
    hasPermission,
  });

  useTabTitle(tabSectionTitle("Equity Bank", "Centrix Payments"));

  return (
    <PaymentsAccessGate
      permissionAny={[P.centrix_payments.bank.view, P.centrix_payments.bank.manage]}
      title="Equity Bank"
    >
      <CatalogPageShell
        title="Equity Bank"
        subtitle="Collection accounts and paybill reconciliation with Equity Bank."
        banner={<PaymentsSettingsBreadcrumb title="Equity Bank" />}
      >
        {!canConfigure ? (
          <PaymentsEmptyState
            title="Insufficient permissions"
            description="Ask an administrator to grant bank account management access on your role."
          />
        ) : (
          <AdminEquityAccountsScreen embedded showBreadcrumb={false} hidePageHeader />
        )}
      </CatalogPageShell>
    </PaymentsAccessGate>
  );
}
