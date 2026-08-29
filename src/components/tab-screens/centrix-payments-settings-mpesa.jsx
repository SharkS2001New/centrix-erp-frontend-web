"use client";

import { AdminMpesaSettingsScreen } from "@/components/tab-screens/admin-mpesa-settings";
import { useAuth } from "@/contexts/auth-context";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import {
  canAccessCentrixPaymentsConfiguration,
  isCentrixPaymentsEnabled,
} from "@/lib/platform-org-features";

export function CentrixPaymentsMpesaSettingsScreen() {
  const { user, capabilities, hasPermission } = useAuth();
  const enabled = isCentrixPaymentsEnabled(capabilities);
  const canConfigure = canAccessCentrixPaymentsConfiguration({
    user,
    capabilities,
    hasPermission,
  });

  if (!enabled) {
    return (
      <CatalogPageShell title="M-Pesa settings" subtitle="Daraja credentials and STK defaults">
        <p className="text-sm text-amber-800">Centrix Payments is disabled for this organization.</p>
      </CatalogPageShell>
    );
  }

  if (!canConfigure) {
    return (
      <CatalogPageShell title="M-Pesa settings" subtitle="Daraja credentials and STK defaults">
        <p className="text-sm text-amber-800">You do not have permission to configure M-Pesa settings.</p>
      </CatalogPageShell>
    );
  }

  return <AdminMpesaSettingsScreen embedded showBreadcrumb={false} />;
}
