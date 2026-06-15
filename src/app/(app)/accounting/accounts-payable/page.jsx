"use client";

import Link from "next/link";
import { AccountingReportScreen } from "@/components/accounting/accounting-report-screen";

const relatedReports = [
  { href: "/reports/purchases-by-supplier", label: "Purchases by supplier" },
  { href: "/reports/open-lpo", label: "Open LPO lines" },
  { href: "/reports/supplier-returns", label: "Supplier returns" },
];

export default function AccountsPayablePage() {
  return (
    <AccountingReportScreen
      title="Accounts Payable"
      apiPath="/reports/accounts-payable"
      emptyLabel="No supplier payables outstanding."
      intro={
        <div className="mb-4 rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="text-sm text-slate-600">
            Supplier payables based on received purchase value minus returns. Payment tracking will reduce balances when supplier payments are recorded.
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
