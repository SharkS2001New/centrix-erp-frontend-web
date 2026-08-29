"use client";

import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";
import { P } from "@/lib/permission-codes";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import {
  PaymentsAccessGate,
} from "@/components/centrix-payments/centrix-payments-shared";

export function CentrixPaymentsReconciliationScreen() {
  useTabTitle(tabSectionTitle("Reconciliation", "Centrix Payments"));

  return (
    <PaymentsAccessGate permission={P.centrix_payments.reconcile.view} title="Reconciliation">
      <CatalogPageShell
        title="Reconciliation hub"
        subtitle="Use the sidebar to open M-Pesa, Equity, or bank matching workspaces."
      >
        <p className="theme-subtext max-w-2xl text-sm leading-relaxed">
          Each matching workspace lets finance teams align provider statements with Centrix receipts,
          invoices, and open balances. Pick a workflow from the Reconciliation section in the sidebar.
        </p>
      </CatalogPageShell>
    </PaymentsAccessGate>
  );
}
