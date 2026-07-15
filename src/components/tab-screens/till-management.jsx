"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function TillManagementScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sales/till-management");
  }, [router]);

  return null;
}
