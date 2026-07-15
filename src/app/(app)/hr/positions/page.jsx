"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { HrPositionsScreen } from "@/components/tab-screens/hr-positions";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <HrPositionsScreen />;
}
