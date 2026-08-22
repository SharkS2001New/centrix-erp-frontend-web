"use client";

import { useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import SalesOrdersListScreen from "@/components/sales/sales-orders-list-screen";
import { shouldShowShopDebtors } from "@/lib/nav-feature-gates";
import {
  canViewShopDebtorsBucket,
  defaultShopDebtorsBucket,
} from "@/lib/shop-debtors-permissions";

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

/** Shop debtor orders by payment bucket (mobile field sales and route customers excluded). */
export function SalesShopDebtorsStatusScreen({ paymentStatus: paymentStatusProp = null } = {}) {
  const params = useParams();
  const router = useRouter();
  const { capabilities, hasPermission, hasNavPermission } = useAuth();
  const check =
    typeof hasNavPermission === "function" ? hasNavPermission : hasPermission;

  const paymentStatus = useMemo(() => {
    if (paymentStatusProp && SHOP_DEBTOR_STATUSES.has(paymentStatusProp)) {
      return paymentStatusProp;
    }
    return resolveShopDebtorsPaymentStatus(params?.status);
  }, [params?.status, paymentStatusProp]);

  const bucketAllowed =
    shouldShowShopDebtors(capabilities) &&
    paymentStatus &&
    (typeof check !== "function" || canViewShopDebtorsBucket(paymentStatus, check));

  const fallbackBucket =
    typeof check === "function" ? defaultShopDebtorsBucket(check) : "unpaid";

  useEffect(() => {
    if (!shouldShowShopDebtors(capabilities)) {
      router.replace("/sales/orders");
      return;
    }
    if (!paymentStatus) {
      router.replace(
        fallbackBucket ? `/sales/shop-debtors/${fallbackBucket}` : "/sales/orders",
      );
      return;
    }
    if (!bucketAllowed) {
      router.replace(
        fallbackBucket ? `/sales/shop-debtors/${fallbackBucket}` : "/sales/orders",
      );
    }
  }, [bucketAllowed, capabilities, fallbackBucket, paymentStatus, router]);

  if (!bucketAllowed || !paymentStatus) return null;

  return (
    <SalesOrdersListScreen
      shopDebtorsOnly
      shopDebtorsPaymentStatus={paymentStatus}
    />
  );
}
