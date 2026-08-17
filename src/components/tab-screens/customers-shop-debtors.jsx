"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { shouldShowShopDebtors } from "@/lib/nav-feature-gates";
import { P } from "@/lib/permission-codes";

/** Legacy path — redirect to Unpaid Debtors. */
export function CustomersShopDebtorsScreen() {
  const router = useRouter();
  const { capabilities, hasPermission, hasNavPermission } = useAuth();
  const check =
    typeof hasNavPermission === "function" ? hasNavPermission : hasPermission;
  const allowed =
    shouldShowShopDebtors(capabilities) &&
    (typeof check !== "function" || check(P.customers.shop_debtors.view));

  useEffect(() => {
    router.replace(allowed ? "/sales/shop-debtors/unpaid" : "/sales/orders");
  }, [allowed, router]);

  return null;
}
