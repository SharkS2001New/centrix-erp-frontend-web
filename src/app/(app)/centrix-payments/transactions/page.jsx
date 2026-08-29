"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { CentrixPaymentsTransactionsScreen } from "@/components/tab-screens/centrix-payments-transactions";

export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <CentrixPaymentsTransactionsScreen />;
}
