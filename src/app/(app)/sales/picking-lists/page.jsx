"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesPickingListsScreen } from "@/components/tab-screens/sales-picking-lists";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesPickingListsScreen />;
}
