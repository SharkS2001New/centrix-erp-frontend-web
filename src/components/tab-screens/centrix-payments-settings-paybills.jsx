"use client";

import { AdminMpesaPaybillsScreen } from "@/components/tab-screens/admin-mpesa-paybills";
import { useAuth } from "@/contexts/auth-context";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import {
  canAccessCentrixPaymentsConfiguration,
  isCentrixPaymentsEnabled,
} from "@/lib/platform-org-features";

export function CentrixPaymentsPaybillsSettingsScreen() {
  const { user, capabilities, hasPermission } = useAuth();
  const enabled = isCentrixPaymentsEnabled(capabilities);
  const canConfigure = canAccessCentrixPaymentsConfiguration({
    user,
    capabilities,
    hasPermission,
  });

  if (!enabled) {
    return (
      <CatalogPageShell title="Paybill accounts" subtitle="M-Pesa paybills and tills">
        <p className="text-sm text-amber-800">Centrix Payments is disabled for this organization.</p>
      </CatalogPageShell>
    );
  }

  if (!canConfigure) {
    return (
      <CatalogPageShell title="Paybill accounts" subtitle="M-Pesa paybills and tills">
        <p className="text-sm text-amber-800">You do not have permission to manage paybill accounts.</p>
      </CatalogPageShell>
    );
  }

  return <AdminMpesaPaybillsScreen embedded showBreadcrumb={false} />;
}
