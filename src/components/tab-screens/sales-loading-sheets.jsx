"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import MobileLoadingSheetsScreen from "@/components/sales/mobile-loading-sheets-screen";
import { isDistributionOpsEnabled } from "@/lib/distribution-settings";
import { loadingListNavHref } from "@/lib/sales-settings";

export function SalesLoadingSheetsScreen() {
  const router = useRouter();
  const { capabilities } = useAuth();

  useEffect(() => {
    if (isDistributionOpsEnabled(capabilities)) {
      router.replace(loadingListNavHref(capabilities));
    }
  }, [capabilities, router]);

  if (isDistributionOpsEnabled(capabilities)) {
    return null;
  }

  return <MobileLoadingSheetsScreen />;
}
