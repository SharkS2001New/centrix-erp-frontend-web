"use client";

import { useCallback, useMemo, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";
import { P } from "@/lib/permission-codes";
import { apiRequest } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError } from "@/lib/notify";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import {
  DashboardSection,
  PAYMENTS_SETTINGS_ITEMS,
  PaymentsAccessGate,
  PaymentsSettingsGrid,
  PaymentsSetupGuide,
} from "@/components/centrix-payments/centrix-payments-shared";

export function CentrixPaymentsSettingsScreen() {
  const { hasPermission } = useAuth();
  const [availability, setAvailability] = useState(null);

  const loadAvailability = useCallback(async () => {
    try {
      const res = await apiRequest("/centrix-payments/dashboard");
      setAvailability(res?.availability ?? {});
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load channel status");
      setAvailability({});
    }
  }, []);

  useTabAwareDataLoad(loadAvailability);
  useTabTitle(tabSectionTitle("Channel setup", "Centrix Payments"));

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
      title="Channel setup"
    >
      <CatalogPageShell
        title="Channel setup"
        subtitle="M-Pesa Daraja credentials, paybills, and Equity collection accounts."
      >
        <div className="space-y-8 pb-4">
          <PaymentsSetupGuide availability={availability} hasPermission={hasPermission} />

          <DashboardSection
            title="Payment channels"
            subtitle="Open a channel to configure keys, shortcodes, or collection accounts"
          >
            {settingsItems.length === 0 ? (
              <p className="theme-subtext text-sm">You do not have permission to manage payment channels.</p>
            ) : (
              <PaymentsSettingsGrid items={settingsItems} />
            )}
          </DashboardSection>
        </div>
      </CatalogPageShell>
    </PaymentsAccessGate>
  );
}
