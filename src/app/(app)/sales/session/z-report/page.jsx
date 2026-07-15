"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesSessionZReportScreen } from "@/components/tab-screens/sales-session-z-report";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesSessionZReportScreen />;
}
