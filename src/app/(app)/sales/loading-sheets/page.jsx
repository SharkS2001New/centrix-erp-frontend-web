"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/auth-context";
import MobileLoadingSheetsScreen from "@/components/sales/mobile-loading-sheets-screen";
import { loadingListNavHref, shouldShowDistributionLoadingLists } from "@/lib/sales-settings";

export default function SalesLoadingSheetsPage() {
  const router = useRouter();
  const { capabilities } = useAuth();

  useEffect(() => {
    if (shouldShowDistributionLoadingLists(capabilities)) {
      router.replace(loadingListNavHref(capabilities));
    }
  }, [capabilities, router]);

  if (shouldShowDistributionLoadingLists(capabilities)) {
    return null;
  }

  return <MobileLoadingSheetsScreen />;
}
