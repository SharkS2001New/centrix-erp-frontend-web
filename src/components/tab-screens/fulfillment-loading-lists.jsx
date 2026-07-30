"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import { DistributionLoadingListsScreen } from "@/components/fulfillment/distribution-loading-lists-screen";
import { isDistributionOpsEnabled } from "@/lib/distribution-settings";
import { fieldSalesLoadingSheetsHref, shouldShowMobileLoadingSheets } from "@/lib/sales-settings";

export function FulfillmentLoadingListsScreen() {
  const router = useRouter();
  const { capabilities } = useAuth();

  useEffect(() => {
    if (!isDistributionOpsEnabled(capabilities) && shouldShowMobileLoadingSheets(capabilities)) {
      router.replace(fieldSalesLoadingSheetsHref());
    }
  }, [capabilities, router]);

  if (!isDistributionOpsEnabled(capabilities) && shouldShowMobileLoadingSheets(capabilities)) {
    return null;
  }

  return <DistributionLoadingListsScreen />;
}
