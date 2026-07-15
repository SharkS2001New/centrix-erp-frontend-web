"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesZReportScreen } from "@/components/tab-screens/sales-z-report";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesZReportScreen />;
}
