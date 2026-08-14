"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { HrDuplicatePunchesScreen } from "@/components/tab-screens/hr-duplicate-punches";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <HrDuplicatePunchesScreen />;
}
