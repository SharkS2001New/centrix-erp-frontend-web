"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AdminAttendanceClockScreen() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/hr/attendance-clock");
  }, [router]);
  return null;
}
