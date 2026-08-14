"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { HrAbsentsScreen } from "@/components/tab-screens/hr-absents";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <HrAbsentsScreen />;
}
