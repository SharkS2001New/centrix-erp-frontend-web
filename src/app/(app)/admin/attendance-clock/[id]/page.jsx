"use client";

import { useTabWorkspace } from "@/contexts/tab-workspace-context";
import { AdminAttendanceClockIdScreen } from "@/components/tab-screens/admin-attendance-clock-id";

/** Tab workspace hosts this screen from the registry when enabled. */
export default function Page() {
  const { enabled } = useTabWorkspace();
  if (enabled) return null;
  return <AdminAttendanceClockIdScreen />;
}
