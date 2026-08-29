"use client";

import { AdminMpesaPaybillsScreen } from "@/components/tab-screens/admin-mpesa-paybills";
import { useAuth } from "@/contexts/auth-context";
import { isCentrixPaymentsEnabled } from "@/lib/platform-org-features";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";

/** M-Pesa account management under Centrix Payments hub. */
export function CentrixPaymentsMpesaScreen() {
  const { capabilities } = useAuth();
  const enabled = isCentrixPaymentsEnabled(capabilities);

  if (!enabled) {
    return (
      <CatalogPageShell title="M-Pesa" subtitle="Configure paybills and tills">
        <p className="text-sm text-amber-800">Centrix Payments is disabled for this organization.</p>
      </CatalogPageShell>
    );
  }

  return <AdminMpesaPaybillsScreen />;
}
