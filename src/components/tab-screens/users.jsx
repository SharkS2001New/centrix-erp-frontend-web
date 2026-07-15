"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function UsersScreen() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/admin/users");
  }, [router]);

  return null;
}
