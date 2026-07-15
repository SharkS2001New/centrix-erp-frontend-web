"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { ReportsLegacyArchiveScreen } from "@/components/tab-screens/reports-legacy-archive";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <ReportsLegacyArchiveScreen />;
}
