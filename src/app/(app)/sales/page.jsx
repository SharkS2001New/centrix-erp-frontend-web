"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesScreen } from "@/components/tab-screens/sales";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesScreen />;
}
