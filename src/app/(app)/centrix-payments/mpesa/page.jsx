"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { CentrixPaymentsMpesaScreen } from "@/components/tab-screens/centrix-payments-mpesa";

export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <CentrixPaymentsMpesaScreen />;
}
