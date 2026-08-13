"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { CustomersListScreen } from "@/components/customers/customers-list-screen";
import { shouldShowShopDebtors } from "@/lib/nav-feature-gates";
import { P } from "@/lib/permission-codes";

/** Shop / till credit customers only — excludes route customers. */
export function CustomersShopDebtorsScreen() {
  const router = useRouter();
  const { capabilities, hasPermission, hasNavPermission } = useAuth();
  const check =
    typeof hasNavPermission === "function" ? hasNavPermission : hasPermission;
  const allowed =
    shouldShowShopDebtors(capabilities) &&
    (typeof check !== "function" || check(P.customers.shop_debtors.view));

  useEffect(() => {
    if (!allowed) {
      router.replace("/customers");
    }
  }, [allowed, router]);

  if (!allowed) return null;

  return <CustomersListScreen shopDebtorsOnly />;
}
