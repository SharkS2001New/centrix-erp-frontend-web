"use client";

import { AdminMpesaPaybillsScreen } from "@/components/tab-screens/admin-mpesa-paybills";
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

export function CentrixPaymentsPaybillsSettingsScreen() {
  const { user, organization, capabilities, hasPermission } = useAuth();
  const canConfigure = canAccessCentrixPaymentsConfiguration({
    user,
    capabilities,
    hasPermission,
  });

  useTabTitle(tabSectionTitle("Paybill accounts", "Centrix Payments"));

  return (
    <PaymentsAccessGate
      permissionAny={[
        P.centrix_payments.mpesa.view,
        P.centrix_payments.mpesa.manage,
        P.centrix_payments.accounts.view,
      ]}
      title="Paybill accounts"
    >
      <div className="space-y-6 pb-8">
        <PaymentsHero
          organizationName={organization?.org_name}
          eyebrow="Centrix Payments · Paybills"
          subtitle="Shortcodes, tills, and branch or route routing for Lipa na M-Pesa collections."
        />
        <PaymentsSettingsBreadcrumb title="Paybill accounts" />
        {!canConfigure ? (
          <PaymentsEmptyState
            title="Insufficient permissions"
            description="Ask an administrator to grant paybill management access on your role."
          />
        ) : (
          <AdminMpesaPaybillsScreen embedded showBreadcrumb={false} hidePageHeader />
        )}
      </div>
    </PaymentsAccessGate>
  );
}
