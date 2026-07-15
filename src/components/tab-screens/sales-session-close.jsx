"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SalesSessionCloseScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sales/pos");
  }, [router]);

  return null;
}
