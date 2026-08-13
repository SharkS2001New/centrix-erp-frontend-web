"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { HrPayrollScreen } from "@/components/tab-screens/hr-payroll";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <HrPayrollScreen />;
}
