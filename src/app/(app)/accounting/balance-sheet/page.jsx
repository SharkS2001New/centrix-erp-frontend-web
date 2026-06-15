"use client";

import { AccountingReportScreen } from "@/components/accounting/accounting-report-screen";

export default function BalanceSheetPage() {
  return (
    <AccountingReportScreen
      title="Balance Sheet"
      apiPath="/reports/balance-sheet"
      emptyLabel="No balance sheet amounts as of this date."
    />
  );
}
