"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { routeParamValue } from "@/lib/route-params";

export function AdminAttendanceClockIdScreen() {
  const router = useRouter();
  const params = useParams();
  const deviceId = routeParamValue(params?.id);

  useEffect(() => {
    if (!deviceId) {
      router.replace("/hr/attendance-clock");
      return;
    }
    router.replace(`/hr/attendance-clock/${deviceId}`);
  }, [deviceId, router]);

  return null;
}
