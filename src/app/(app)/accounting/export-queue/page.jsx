"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AccountingExportQueueScreen } from "@/components/tab-screens/accounting-export-queue";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AccountingExportQueueScreen />;
}
