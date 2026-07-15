"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SalesTillsScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sales/till-management?tab=tills");
  }, [router]);

  return null;
}
