"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { TillManagementScreen } from "@/components/tab-screens/till-management";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <TillManagementScreen />;
}
