"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AccountingEquityReconciliationScreen } from "@/components/tab-screens/accounting-equity-reconciliation";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AccountingEquityReconciliationScreen />;
}
