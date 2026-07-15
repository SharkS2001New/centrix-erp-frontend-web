"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export function RoutesIdScreen() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;

  useEffect(() => {
    if (!id) return;
    router.replace(`/fulfillment/routes/${id}`);
  }, [id, router]);

  return null;
}
