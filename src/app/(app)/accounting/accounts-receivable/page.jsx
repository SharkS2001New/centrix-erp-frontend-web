"use client";

import Link from "next/link";
import { AccountingReportScreen } from "@/components/accounting/accounting-report-screen";

const relatedReports = [
  { href: "/reports/ar-aging", label: "AR aging" },
  { href: "/reports/top-debtors", label: "Top debtors" },
  { href: "/reports/credit-outstanding", label: "Credit sales outstanding" },
  { href: "/reports/invoice-payments", label: "Invoice payments" },
];

export default function AccountsReceivablePage() {
  return (
    <AccountingReportScreen
      title="Accounts Receivable"
      apiPath="/reports/accounts-receivable"
      emptyLabel="No outstanding receivables."
      intro={
        <div className="mb-4 theme-panel rounded-xl border px-5 py-4 shadow-sm">
          <p className="text-sm text-slate-600">
            Outstanding customer balances from account balances, open invoices, and unpaid credit sales.
          </p>
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            {relatedReports.map((item) => (
              <Link key={item.href} href={item.href} className="font-medium text-[#185FA5] hover:underline">
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      }
    />
  );
}
