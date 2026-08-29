"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { CentrixPaymentsDashboardScreen } from "@/components/tab-screens/centrix-payments-dashboard";

export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <CentrixPaymentsDashboardScreen />;
}
