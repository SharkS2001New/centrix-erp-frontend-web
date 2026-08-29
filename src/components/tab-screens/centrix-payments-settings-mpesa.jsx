"use client";

import { AdminMpesaSettingsScreen } from "@/components/tab-screens/admin-mpesa-settings";
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

export function CentrixPaymentsMpesaSettingsScreen() {
  const { user, organization, capabilities, hasPermission } = useAuth();
  const canConfigure = canAccessCentrixPaymentsConfiguration({
    user,
    capabilities,
    hasPermission,
  });

  useTabTitle(tabSectionTitle("M-Pesa settings", "Centrix Payments"));

  return (
    <PaymentsAccessGate
      permissionAny={[P.centrix_payments.settings.view, P.centrix_payments.settings.edit]}
      title="M-Pesa settings"
    >
      <div className="space-y-6 pb-8">
        <PaymentsHero
          organizationName={organization?.org_name}
          eyebrow="Centrix Payments · M-Pesa"
          subtitle="Safaricom Daraja credentials, STK push defaults, and organization-wide M-Pesa behaviour."
        />
        <PaymentsSettingsBreadcrumb title="M-Pesa settings" />
        {!canConfigure ? (
          <PaymentsEmptyState
            title="Insufficient permissions"
            description="Ask an administrator to grant Centrix Payments settings access on your role."
          />
        ) : (
          <AdminMpesaSettingsScreen embedded showBreadcrumb={false} hidePageHeader />
        )}
      </div>
    </PaymentsAccessGate>
  );
}
