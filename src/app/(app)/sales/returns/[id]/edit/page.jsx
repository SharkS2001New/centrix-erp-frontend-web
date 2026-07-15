"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesReturnsIdEditScreen } from "@/components/tab-screens/sales-returns-id-edit";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesReturnsIdEditScreen />;
}
