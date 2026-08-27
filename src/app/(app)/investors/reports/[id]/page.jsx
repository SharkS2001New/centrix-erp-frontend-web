"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { InvestorsReportsIdScreen } from "@/components/tab-screens/investors-reports-id";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <InvestorsReportsIdScreen />;
}
