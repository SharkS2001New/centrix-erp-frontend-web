"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function EditRouteRedirectPage() {
  const params = useParams();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/fulfillment/routes?edit=${params.id}`);
  }, [router, params.id]);
  return null;
}
