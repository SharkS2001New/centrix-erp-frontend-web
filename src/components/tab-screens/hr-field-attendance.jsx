"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function HrFieldAttendanceScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/hr/attendance#field-sessions");
  }, [router]);

  return null;
}
