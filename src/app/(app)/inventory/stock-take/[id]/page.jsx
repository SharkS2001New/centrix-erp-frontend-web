"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { InventoryStockTakeIdScreen } from "@/components/tab-screens/inventory-stock-take-id";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <InventoryStockTakeIdScreen />;
}
