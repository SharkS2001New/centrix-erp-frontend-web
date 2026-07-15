"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { HrKpisScreen } from "@/components/tab-screens/hr-kpis";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <HrKpisScreen />;
}
