"use client";

import { AccountingReportScreen } from "@/components/accounting/accounting-report-screen";

export function AccountingProfitLossScreen() {
  return (
    <AccountingReportScreen
      title="Profit & Loss"
      subtitle="GL revenue and expenses for the selected period"
      apiPath="/reports/profit-loss-gl"
      emptyLabel="No posted revenue or expense activity for this period. Post journal entries (or enable auto-post from sales) to see P&L."
    />
  );
}
