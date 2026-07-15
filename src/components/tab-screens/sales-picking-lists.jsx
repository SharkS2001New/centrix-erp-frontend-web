"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import MobilePickingSheetsScreen from "@/components/sales/mobile-picking-sheets-screen";
import { isDistributionOpsEnabled } from "@/lib/distribution-settings";

export function SalesPickingListsScreen() {
  const router = useRouter();
  const { capabilities } = useAuth();

  useEffect(() => {
    if (isDistributionOpsEnabled(capabilities)) {
      router.replace("/fulfillment/picking");
    }
  }, [capabilities, router]);

  if (isDistributionOpsEnabled(capabilities)) {
    return null;
  }

  return <MobilePickingSheetsScreen />;
}
