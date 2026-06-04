"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RoutesRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/fulfillment/routes");
  }, [router]);
  return null;
}
