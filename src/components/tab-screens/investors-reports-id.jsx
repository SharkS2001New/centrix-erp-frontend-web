"use client";

import { useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";
import {
  INVESTOR_REPORT_KINDS,
  isValidInvestorRouteId,
} from "@/components/investors/investor-reports-view";

/** Legacy deep link → hub with investor + kind filters. */
export function InvestorsReportsIdScreen() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const investorId = params.id;

  useTabTitle(tabSectionTitle("Reports", "Investors"));

  useEffect(() => {
    const rawId = Array.isArray(investorId) ? investorId[0] : investorId;
    if (!isValidInvestorRouteId(rawId)) {
      router.replace("/investors/reports");
      return;
    }
    const kindRaw = searchParams.get("kind") || "sales";
    const kind = INVESTOR_REPORT_KINDS.some((k) => k.id === kindRaw) ? kindRaw : "sales";
    const qs = new URLSearchParams({ investor: String(rawId), kind });
    router.replace(`/investors/reports?${qs.toString()}`);
  }, [investorId, router, searchParams]);

  return <p className="p-6 text-sm text-slate-500">Opening report…</p>;
}
