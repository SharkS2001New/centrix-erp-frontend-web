"use client";

import Link from "next/link";
import { CatalogPageShell, PrimaryLink } from "@/components/catalog/catalog-shared";

const links = [
  { href: "/accounting/chart-of-accounts", label: "Chart of Accounts", description: "Manage GL accounts and balances" },
  { href: "/accounting/journal-entries", label: "Journal Entries", description: "Create, post, and reverse journal entries" },
  { href: "/accounting/fiscal-periods", label: "Fiscal Periods", description: "Monthly close checklist and year-end" },
  { href: "/accounting/settings", label: "Settings", description: "Auto-post toggles and chart seeding" },
  { href: "/accounting/account-mappings", label: "Account Mappings", description: "Map GL accounts to QuickBooks" },
  { href: "/accounting/export-queue", label: "Export Queue", description: "Monitor external journal exports" },
  { href: "/accounting/general-ledger", label: "General Ledger", description: "Line-level posted journal activity" },
  { href: "/accounting/trial-balance", label: "Trial Balance", description: "Debit and credit balances by account" },
  { href: "/accounting/balance-sheet", label: "Balance Sheet", description: "Assets, liabilities, and equity snapshot" },
  { href: "/accounting/profit-loss", label: "Profit & Loss", description: "Revenue and expense by GL account" },
  { href: "/accounting/cash-flow", label: "Cash Flow", description: "Cash and bank account movements" },
  { href: "/accounting/accounts-receivable", label: "Accounts Receivable", description: "Customer outstanding balances" },
  { href: "/accounting/accounts-payable", label: "Accounts Payable", description: "Supplier payables from purchases" },
  { href: "/expenses", label: "Expenses", description: "Operational expense records" },
  { href: "/reports", label: "All Reports", description: "Sales, inventory, and finance reports" },
];

export default function AccountingDashboardPage() {
  return (
    <CatalogPageShell
      title="Accounting"
      subtitle="Finance and general ledger"
      actions={<PrimaryLink href="/accounting/journal-entries/new">New Entry</PrimaryLink>}
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {links.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-[#185FA5]/30 hover:shadow"
          >
            <h2 className="text-base font-semibold text-slate-900">{item.label}</h2>
            <p className="mt-1 text-sm text-slate-600">{item.description}</p>
          </Link>
        ))}
      </div>
    </CatalogPageShell>
  );
}
