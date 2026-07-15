"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { ReportsBuilderScreen } from "@/components/tab-screens/reports-builder";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <ReportsBuilderScreen />;
}
