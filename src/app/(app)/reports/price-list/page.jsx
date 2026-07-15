"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { ReportsPriceListScreen } from "@/components/tab-screens/reports-price-list";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <ReportsPriceListScreen />;
}
