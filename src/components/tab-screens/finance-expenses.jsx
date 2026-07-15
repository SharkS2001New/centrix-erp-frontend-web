"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function FinanceExpensesScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/expenses");
  }, [router]);

  return null;
}
