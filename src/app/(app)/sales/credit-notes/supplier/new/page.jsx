"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesCreditNotesSupplierNewScreen } from "@/components/tab-screens/sales-credit-notes-supplier-new";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesCreditNotesSupplierNewScreen />;
}
