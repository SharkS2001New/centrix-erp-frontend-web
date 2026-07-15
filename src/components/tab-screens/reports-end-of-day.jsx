"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function ReportsEndOfDayScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sales/end-of-day");
  }, [router]);

  return null;
}
