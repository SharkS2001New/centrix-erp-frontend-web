"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SalesSessionXReportScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sales/pos");
  }, [router]);

  return null;
}
