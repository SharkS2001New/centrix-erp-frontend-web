"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { ReportsEndOfDayScreen } from "@/components/tab-screens/reports-end-of-day";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <ReportsEndOfDayScreen />;
}
