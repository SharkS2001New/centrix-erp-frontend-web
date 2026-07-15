"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SalesSessionScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/sales/pos");
  }, [router]);

  return null;
}
