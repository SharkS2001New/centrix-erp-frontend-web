"use client";

import { useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import SalesOrdersListScreen from "@/components/sales/sales-orders-list-screen";
import { shouldShowShopDebtors } from "@/lib/nav-feature-gates";
import { P } from "@/lib/permission-codes";

const SHOP_DEBTOR_STATUSES = new Set(["unpaid", "partial", "paid"]);

/** Normalize URL slug → payment bucket used by the API / list screen. */
export function resolveShopDebtorsPaymentStatus(raw) {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");
  if (key === "partially-paid" || key === "partial") return "partial";
  if (key === "unpaid" || key === "paid") return key;
  return null;
}

/** Shop-only debtor orders by payment bucket (route + mobile excluded). */
export function SalesShopDebtorsStatusScreen({ paymentStatus: paymentStatusProp = null } = {}) {
  const params = useParams();
  const router = useRouter();
  const { capabilities, hasPermission, hasNavPermission } = useAuth();
  const check =
    typeof hasNavPermission === "function" ? hasNavPermission : hasPermission;
  const allowed =
    shouldShowShopDebtors(capabilities) &&
    (typeof check !== "function" || check(P.customers.shop_debtors.view));

  const paymentStatus = useMemo(() => {
    if (paymentStatusProp && SHOP_DEBTOR_STATUSES.has(paymentStatusProp)) {
      return paymentStatusProp;
    }
    return resolveShopDebtorsPaymentStatus(params?.status);
  }, [params?.status, paymentStatusProp]);

  useEffect(() => {
    if (!allowed) {
      router.replace("/sales/orders");
      return;
    }
    if (!paymentStatus) {
      router.replace("/sales/shop-debtors/unpaid");
    }
  }, [allowed, paymentStatus, router]);

  if (!allowed || !paymentStatus) return null;

  return (
    <SalesOrdersListScreen
      shopDebtorsOnly
      shopDebtorsPaymentStatus={paymentStatus}
    />
  );
}
