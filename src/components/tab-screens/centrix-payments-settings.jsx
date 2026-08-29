"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";
import { P } from "@/lib/permission-codes";
import {
  DashboardSection,
  PAYMENTS_SETTINGS_ITEMS,
  PaymentsAccessGate,
  PaymentsHero,
  PaymentsSettingsGrid,
} from "@/components/centrix-payments/centrix-payments-shared";

export function CentrixPaymentsSettingsScreen() {
  const { organization, hasPermission } = useAuth();

  useTabTitle(tabSectionTitle("Settings", "Centrix Payments"));

  const settingsItems = useMemo(() => {
    return PAYMENTS_SETTINGS_ITEMS.filter((item) => {
      if (item.permissionAny?.length) {
        return item.permissionAny.some((code) => hasPermission?.(code));
      }
      if (item.permission) return hasPermission?.(item.permission);
      return true;
    });
  }, [hasPermission]);

  return (
    <PaymentsAccessGate
      permissionAny={[
        P.centrix_payments.settings.view,
        P.centrix_payments.settings.edit,
        P.centrix_payments.mpesa.view,
        P.centrix_payments.mpesa.manage,
        P.centrix_payments.bank.view,
        P.centrix_payments.bank.manage,
      ]}
      title="Settings"
    >
      <div className="space-y-8 pb-8">
        <PaymentsHero
          organizationName={organization?.org_name}
          eyebrow="Centrix Payments · Settings"
          subtitle="Configure M-Pesa Daraja, paybills, and Equity collection accounts — everything your organization needs to receive and reconcile payments."
        />

        <DashboardSection
          title="Payment channels"
          subtitle="Each channel opens dedicated configuration for keys, shortcodes, and collection accounts"
        >
          {settingsItems.length === 0 ? (
            <p className="theme-subtext text-sm">You do not have permission to manage payment settings.</p>
          ) : (
            <PaymentsSettingsGrid items={settingsItems} />
          )}
        </DashboardSection>
      </div>
    </PaymentsAccessGate>
  );
}
