"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { attendanceClockDeviceHref } from "@/lib/attendance-clock-paths";
import { routeParamValue } from "@/lib/route-params";

/** Device setup is Administration-only; keep this screen only to migrate old HR tabs. */
export function HrAttendanceClockIdScreen() {
  const router = useRouter();
  const params = useParams();
  const id = routeParamValue(params?.id);

  useEffect(() => {
    if (!id) {
      router.replace("/admin/attendance-clock");
      return;
    }
    router.replace(attendanceClockDeviceHref("", id));
  }, [id, router]);

  return null;
}
