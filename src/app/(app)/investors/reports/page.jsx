"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { InvestorsReportsScreen } from "@/components/tab-screens/investors-reports";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <InvestorsReportsScreen />;
}
