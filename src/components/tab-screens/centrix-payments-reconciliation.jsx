"use client";

import Link from "next/link";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";
import { useAuth } from "@/contexts/auth-context";
import { isCentrixPaymentsEnabled } from "@/lib/platform-org-features";
import { P } from "@/lib/permission-codes";
import { CatalogPageShell, SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";

export function CentrixPaymentsReconciliationScreen() {
  const { capabilities, hasPermission } = useAuth();
  const enabled = isCentrixPaymentsEnabled(capabilities);
  const canView = enabled && hasPermission?.(P.centrix_payments.reconcile.view);

  useTabTitle(tabSectionTitle("Reconciliation", "Centrix Payments"));

  return (
    <CatalogPageShell
      title="Reconciliation"
      subtitle="Match M-Pesa, Equity, and bank statement transactions against ERP payments"
    >
      {!enabled ? (
        <p className="text-sm text-amber-800">Centrix Payments is disabled for this organization.</p>
      ) : !canView ? (
        <p className="text-sm text-slate-600">You do not have permission to reconcile payments.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Link href="/accounting/mpesa-reconciliation" className={SECONDARY_BTN_CLASS}>
            M-Pesa reconciliation
          </Link>
          <Link href="/accounting/equity-reconciliation" className={SECONDARY_BTN_CLASS}>
            Equity reconciliation
          </Link>
          <Link href="/accounting/bank-reconciliation" className={SECONDARY_BTN_CLASS}>
            Bank reconciliation
          </Link>
        </div>
      )}
    </CatalogPageShell>
  );
}
