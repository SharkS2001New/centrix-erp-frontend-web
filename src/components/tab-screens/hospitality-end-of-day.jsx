"use client";

import { GenericReportScreen } from "@/components/reports/generic-report-screen";

export function HospitalityEndOfDayScreen() {
  return (
    <GenericReportScreen
      reportKey="hospitality-eod-cashier"
      label="End of day — cashier"
      subtitle="Daily totals by cashier. Room sales = vacant rooms sold from Hotel POS (nights × rate). Food & drink sales = restaurant and bar items only (not rooms). Charge to room = payment posted to a guest folio."
      apiPath="/reports/hospitality-eod-cashier"
    />
  );
}
