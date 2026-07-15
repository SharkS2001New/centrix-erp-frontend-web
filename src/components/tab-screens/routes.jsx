"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RoutesScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/fulfillment/routes");
  }, [router]);

  return null;
}
