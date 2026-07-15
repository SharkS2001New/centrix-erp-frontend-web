"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function RoutesNewScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/fulfillment/routes?create=1");
  }, [router]);

  return null;
}
