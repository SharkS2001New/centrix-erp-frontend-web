"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { HrMissedPunchesScreen } from "@/components/tab-screens/hr-missed-punches";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <HrMissedPunchesScreen />;
}
