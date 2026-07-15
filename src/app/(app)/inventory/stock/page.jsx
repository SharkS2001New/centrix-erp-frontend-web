"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { InventoryStockScreen } from "@/components/tab-screens/inventory-stock";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <InventoryStockScreen />;
}
