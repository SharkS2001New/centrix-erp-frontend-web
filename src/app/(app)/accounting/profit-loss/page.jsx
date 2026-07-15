"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AccountingProfitLossScreen } from "@/components/tab-screens/accounting-profit-loss";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AccountingProfitLossScreen />;
}
