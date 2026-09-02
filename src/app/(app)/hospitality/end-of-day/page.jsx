"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { HospitalityEndOfDayScreen } from "@/components/tab-screens/hospitality-end-of-day";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <HospitalityEndOfDayScreen />;
}
