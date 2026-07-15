"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesLoadingSheetsScreen } from "@/components/tab-screens/sales-loading-sheets";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesLoadingSheetsScreen />;
}
