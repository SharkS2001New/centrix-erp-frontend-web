"use client";

import { AccountingReportScreen } from "@/components/accounting/accounting-report-screen";

export default function TrialBalancePage() {
  return (
    <AccountingReportScreen
      title="Trial Balance"
      apiPath="/reports/trial-balance"
      emptyLabel="No account balances for this period."
    />
  );
}
