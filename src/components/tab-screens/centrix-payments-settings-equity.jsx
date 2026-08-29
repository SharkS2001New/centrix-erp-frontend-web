"use client";

import { AdminEquityAccountsScreen } from "@/components/tab-screens/admin-equity-accounts";
import { useAuth } from "@/contexts/auth-context";
import {
  PaymentsAccessGate,
  PaymentsEmptyState,
  PaymentsHero,
  PaymentsSettingsBreadcrumb,
} from "@/components/centrix-payments/centrix-payments-shared";
import { P } from "@/lib/permission-codes";
import { canAccessCentrixPaymentsConfiguration } from "@/lib/platform-org-features";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";

export function CentrixPaymentsEquitySettingsScreen() {
  const { user, organization, capabilities, hasPermission } = useAuth();
  const canConfigure = canAccessCentrixPaymentsConfiguration({
    user,
    capabilities,
    hasPermission,
  });

  useTabTitle(tabSectionTitle("Equity Bank", "Centrix Payments"));

  return (
    <PaymentsAccessGate
      permissionAny={[P.centrix_payments.bank.view, P.centrix_payments.bank.manage]}
      title="Equity Bank accounts"
    >
      <div className="space-y-6 pb-8">
        <PaymentsHero
          organizationName={organization?.org_name}
          eyebrow="Centrix Payments · Equity Bank"
          subtitle="Collection accounts and paybill reconciliation with Equity Bank."
        />
        <PaymentsSettingsBreadcrumb title="Equity Bank" />
        {!canConfigure ? (
          <PaymentsEmptyState
            title="Insufficient permissions"
            description="Ask an administrator to grant bank account management access on your role."
          />
        ) : (
          <AdminEquityAccountsScreen embedded showBreadcrumb={false} hidePageHeader />
        )}
      </div>
    </PaymentsAccessGate>
  );
}
