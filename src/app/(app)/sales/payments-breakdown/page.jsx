"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { SalesPaymentsBreakdownScreen } from "@/components/tab-screens/sales-payments-breakdown";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <SalesPaymentsBreakdownScreen />;
}
