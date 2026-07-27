"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { HospitalityHousekeepingScreen } from "@/components/tab-screens/hospitality-housekeeping";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <HospitalityHousekeepingScreen />;
}
