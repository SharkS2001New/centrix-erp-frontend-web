"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function SalesSessionZReportScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");

  useEffect(() => {
    const params = new URLSearchParams({ tab: "history" });
    if (sessionId) params.set("zReport", sessionId);
    router.replace(`/sales/till-management?${params.toString()}`);
  }, [router, sessionId]);

  return null;
}
