"use client";

import { AdminEquityAccountsScreen } from "@/components/tab-screens/admin-equity-accounts";
import { useAuth } from "@/contexts/auth-context";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import {
  canAccessCentrixPaymentsConfiguration,
  isCentrixPaymentsEnabled,
} from "@/lib/platform-org-features";

export function CentrixPaymentsEquitySettingsScreen() {
  const { user, capabilities, hasPermission } = useAuth();
  const enabled = isCentrixPaymentsEnabled(capabilities);
  const canConfigure = canAccessCentrixPaymentsConfiguration({
    user,
    capabilities,
    hasPermission,
  });

  if (!enabled) {
    return (
      <CatalogPageShell title="Equity Bank accounts" subtitle="Collection accounts and paybills">
        <p className="text-sm text-amber-800">Centrix Payments is disabled for this organization.</p>
      </CatalogPageShell>
    );
  }

  if (!canConfigure) {
    return (
      <CatalogPageShell title="Equity Bank accounts" subtitle="Collection accounts and paybills">
        <p className="text-sm text-amber-800">You do not have permission to manage bank accounts.</p>
      </CatalogPageShell>
    );
  }

  return <AdminEquityAccountsScreen embedded showBreadcrumb={false} />;
}
