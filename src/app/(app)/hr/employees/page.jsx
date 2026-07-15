"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { HrEmployeesScreen } from "@/components/tab-screens/hr-employees";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <HrEmployeesScreen />;
}
