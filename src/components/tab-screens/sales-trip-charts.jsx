"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import MobileTripChartsScreen from "@/components/sales/mobile-trip-charts-screen";
import { isDistributionOpsEnabled } from "@/lib/distribution-settings";

export function SalesTripChartsScreen() {
  const router = useRouter();
  const { capabilities } = useAuth();

  useEffect(() => {
    if (isDistributionOpsEnabled(capabilities)) {
      router.replace("/fulfillment/trips");
    }
  }, [capabilities, router]);

  if (isDistributionOpsEnabled(capabilities)) {
    return null;
  }

  return <MobileTripChartsScreen />;
}
