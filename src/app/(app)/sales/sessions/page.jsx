"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesSessionsScreen } from "@/components/tab-screens/sales-sessions";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesSessionsScreen />;
}
