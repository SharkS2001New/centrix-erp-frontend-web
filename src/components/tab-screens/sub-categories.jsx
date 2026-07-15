"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SubCategoriesScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/categories");
  }, [router]);

  return null;
}
