"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function PurchasesScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/lpo");
  }, [router]);

  return null;
}
