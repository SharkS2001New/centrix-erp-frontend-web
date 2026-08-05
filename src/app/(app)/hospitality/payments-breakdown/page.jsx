"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { HospitalityPaymentsBreakdownScreen } from "@/components/tab-screens/hospitality-payments-breakdown";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <HospitalityPaymentsBreakdownScreen />;
}
