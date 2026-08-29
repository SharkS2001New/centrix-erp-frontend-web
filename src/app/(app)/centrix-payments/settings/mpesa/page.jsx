"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { CentrixPaymentsMpesaSettingsScreen } from "@/components/tab-screens/centrix-payments-settings-mpesa";

export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <CentrixPaymentsMpesaSettingsScreen />;
}
