"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { shouldShowShopDebtors } from "@/lib/nav-feature-gates";
import { defaultShopDebtorsBucket } from "@/lib/shop-debtors-permissions";

/** Legacy path — redirect to the first allowed shop debtors queue. */
export function CustomersShopDebtorsScreen() {
  const router = useRouter();
  const { capabilities, hasPermission, hasNavPermission } = useAuth();
  const check =
    typeof hasNavPermission === "function" ? hasNavPermission : hasPermission;
  const bucket =
    typeof check === "function" ? defaultShopDebtorsBucket(check) : "unpaid";
  const allowed = shouldShowShopDebtors(capabilities) && bucket;

  useEffect(() => {
    router.replace(allowed ? `/sales/shop-debtors/${bucket}` : "/sales/orders");
  }, [allowed, bucket, router]);

  return null;
}
