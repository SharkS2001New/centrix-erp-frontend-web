"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesSessionCloseScreen } from "@/components/tab-screens/sales-session-close";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesSessionCloseScreen />;
}
