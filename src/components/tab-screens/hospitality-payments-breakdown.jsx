"use client";

import { PaymentsBreakdownScreen } from "@/components/pos/payments-breakdown-screen";

export function HospitalityPaymentsBreakdownScreen() {
  return (
    <PaymentsBreakdownScreen
      apiPath="/reports/hospitality-payments-breakdown"
      title="Payments breakdown"
      subtitle="F&B check payments by tender — Cash, M-Pesa, bank, room charge, and mixed payments"
      orderColumnLabel="Check"
      hideSessionFilter
    />
  );
}
