"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesShopDebtorsStatusScreen } from "@/components/tab-screens/sales-shop-debtors-status";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesShopDebtorsStatusScreen />;
}
