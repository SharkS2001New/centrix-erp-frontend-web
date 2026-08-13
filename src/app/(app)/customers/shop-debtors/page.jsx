"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { CustomersShopDebtorsScreen } from "@/components/tab-screens/customers-shop-debtors";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <CustomersShopDebtorsScreen />;
}
