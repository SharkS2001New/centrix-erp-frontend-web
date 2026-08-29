"use client";

import Link from "next/link";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";
import { useAuth } from "@/contexts/auth-context";
import { P } from "@/lib/permission-codes";
import {
  DashboardSection,
  PaymentsAccessGate,
  PaymentsHero,
} from "@/components/centrix-payments/centrix-payments-shared";

const RECON_WORKFLOWS = [
  {
    href: "/accounting/mpesa-reconciliation",
    title: "M-Pesa reconciliation",
    description: "Match Lipa na M-Pesa and C2B notifications against sales receipts and open balances.",
    badge: "M-Pesa",
    tone: "from-emerald-600 to-teal-700",
  },
  {
    href: "/accounting/equity-reconciliation",
    title: "Equity reconciliation",
    description: "Align Equity paybill collections with ERP payments and outstanding customer accounts.",
    badge: "Equity",
    tone: "from-sky-700 to-indigo-700",
  },
  {
    href: "/accounting/bank-reconciliation",
    title: "Bank reconciliation",
    description: "Import bank statements and clear unmatched credits against invoices and receipts.",
    badge: "Bank",
    tone: "from-slate-700 to-slate-900",
  },
];

export function CentrixPaymentsReconciliationScreen() {
  const { organization } = useAuth();

  useTabTitle(tabSectionTitle("Reconciliation", "Centrix Payments"));

  return (
    <PaymentsAccessGate permission={P.centrix_payments.reconcile.view} title="Reconciliation">
      <div className="space-y-8 pb-8">
        <PaymentsHero
          organizationName={organization?.org_name}
          subtitle="Close the loop between provider statements and Centrix — resolve unmatched M-Pesa, Equity, and bank items."
        />

        <DashboardSection
          title="Reconciliation workspaces"
          subtitle="Each workflow opens the detailed matching tools used by finance teams"
        >
          <div className="grid gap-4 lg:grid-cols-3">
            {RECON_WORKFLOWS.map((flow) => (
              <Link
                key={flow.href}
                href={flow.href}
                className="theme-panel group overflow-hidden rounded-2xl border shadow-sm transition hover:border-teal-500/40 hover:shadow-md"
              >
                <div className={`bg-gradient-to-r ${flow.tone} px-5 py-4 text-white`}>
                  <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                    {flow.badge}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold group-hover:underline">{flow.title}</h3>
                </div>
                <p className="px-5 py-4 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                  {flow.description}
                </p>
                <p className="px-5 pb-4 text-sm font-medium text-teal-700 dark:text-teal-300">
                  Open workspace →
                </p>
              </Link>
            ))}
          </div>
        </DashboardSection>
      </div>
    </PaymentsAccessGate>
  );
}
