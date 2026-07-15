"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AccountingChartOfAccountsScreen } from "@/components/tab-screens/accounting-chart-of-accounts";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AccountingChartOfAccountsScreen />;
}
