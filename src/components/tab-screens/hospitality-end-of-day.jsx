"use client";

import { EndOfDayReportScreen } from "@/components/pos/end-of-day-report-screen";

export function HospitalityEndOfDayScreen() {
  return (
    <EndOfDayReportScreen
      apiPath="/reports/hospitality-eod-report"
      breadcrumbLabel="End of day — cashier"
      dailyTitle="End of Day — Cashier"
      monthlyTitle="Monthly cashier report"
      hideTillPanels
      hideExpensesPanel
      hideDebtorsPanel
      hideExpensesStat
      transactionsLabel="Total checks"
      transactionsHint="Paid / settled checks"
      showHospitalityMetrics
    />
  );
}
