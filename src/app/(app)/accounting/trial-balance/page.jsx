"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AccountingTrialBalanceScreen } from "@/components/tab-screens/accounting-trial-balance";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AccountingTrialBalanceScreen />;
}
