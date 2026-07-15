"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesLegacyReturnsNewScreen } from "@/components/tab-screens/sales-legacy-returns-new";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesLegacyReturnsNewScreen />;
}
