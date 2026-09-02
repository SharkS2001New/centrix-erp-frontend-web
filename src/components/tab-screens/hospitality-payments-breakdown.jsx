"use client";

import { PaymentsBreakdownScreen } from "@/components/pos/payments-breakdown-screen";

export function HospitalityPaymentsBreakdownScreen() {
  return (
    <PaymentsBreakdownScreen
      apiPath="/reports/hospitality-payments-breakdown"
      title="Payments breakdown"
      subtitle="Restaurant and bar check payments by tender — Cash, M-Pesa, bank, charge to room, and mixed payments"
      orderColumnLabel="Check"
      hideSessionFilter
    />
  );
}
