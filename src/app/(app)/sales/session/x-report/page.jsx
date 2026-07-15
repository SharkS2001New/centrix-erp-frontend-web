"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesSessionXReportScreen } from "@/components/tab-screens/sales-session-x-report";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesSessionXReportScreen />;
}
