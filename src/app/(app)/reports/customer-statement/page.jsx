"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { ReportsCustomerStatementScreen } from "@/components/tab-screens/reports-customer-statement";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <ReportsCustomerStatementScreen />;
}
