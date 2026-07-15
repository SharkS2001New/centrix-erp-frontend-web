"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesTillsScreen } from "@/components/tab-screens/sales-tills";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesTillsScreen />;
}
