"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SalesTillPrintingScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/till-printing");
  }, [router]);

  return null;
}
