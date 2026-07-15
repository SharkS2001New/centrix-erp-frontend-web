"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { InventoryDamagesScreen } from "@/components/tab-screens/inventory-damages";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <InventoryDamagesScreen />;
}
