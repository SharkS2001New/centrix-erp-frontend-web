"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesTripChartsScreen } from "@/components/tab-screens/sales-trip-charts";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesTripChartsScreen />;
}
