"use client";

import { AccountingReportScreen } from "@/components/accounting/accounting-report-screen";

export function AccountingProfitLossScreen() {
  return (
    <AccountingReportScreen
      title="Profit & Loss"
      apiPath="/reports/profit-loss-gl"
      emptyLabel="No revenue or expense activity for this period."
    />
  );
}
