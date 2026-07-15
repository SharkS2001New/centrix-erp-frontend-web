"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function EmployeesScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/hr/employees");
  }, [router]);

  return null;
}
