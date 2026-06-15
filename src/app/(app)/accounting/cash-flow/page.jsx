"use client";

import { AccountingReportScreen } from "@/components/accounting/accounting-report-screen";

export default function CashFlowPage() {
  return (
    <AccountingReportScreen
      title="Cash Flow Statement"
      apiPath="/reports/cash-flow"
      emptyLabel="No cash account movements for this period."
    />
  );
}
