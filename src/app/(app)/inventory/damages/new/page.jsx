"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { InventoryDamagesNewScreen } from "@/components/tab-screens/inventory-damages-new";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <InventoryDamagesNewScreen />;
}
