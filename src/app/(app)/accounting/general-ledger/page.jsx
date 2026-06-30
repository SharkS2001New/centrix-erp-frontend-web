"use client";

import { AccountingReportScreen } from "@/components/accounting/accounting-report-screen";

export default function GeneralLedgerPage() {
  return (
    <AccountingReportScreen
      title="General Ledger"
      apiPath="/reports/general-ledger"
      showAccountFilter
      enableSearch
      emptyLabel="No posted journal lines for this filter."
    />
  );
}
