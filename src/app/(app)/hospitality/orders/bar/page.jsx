"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { HospitalityBarOrdersScreen } from "@/components/tab-screens/hospitality-orders";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <HospitalityBarOrdersScreen />;
}
