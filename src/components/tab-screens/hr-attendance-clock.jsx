"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ATTENDANCE_CLOCK_ADMIN_PATH } from "@/lib/attendance-clock-paths";

/** Device setup is Administration-only; keep this screen only to migrate old HR tabs. */
export function HrAttendanceClockScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace(ATTENDANCE_CLOCK_ADMIN_PATH);
  }, [router]);
  return null;
}
