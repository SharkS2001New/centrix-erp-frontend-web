"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewRouteRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/fulfillment/routes?create=1");
  }, [router]);
  return null;
}
