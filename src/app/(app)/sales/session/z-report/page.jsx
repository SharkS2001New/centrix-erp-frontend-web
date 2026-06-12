"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { PosReportView } from "@/components/pos/pos-report-view";
import { PosStatusBadge, printPosTillReport } from "@/components/pos/pos-shared";
import { tillDisplayName } from "@/lib/pos-till";
import { isPosTillFloatRequired } from "@/lib/sales-settings";

export default function ZReportPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session");
  const { user, capabilities } = useAuth();

  const [payload, setPayload] = useState(null);
  const [till, setTill] = useState(null);
  const [cashierName, setCashierName] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      router.replace("/sales/pos");
      return;
    }
    apiRequest(`/pos/sessions/${sessionId}/z-report`)
      .then(async (res) => {
        setPayload(res);
        const session = res.session ?? res.report?.session;
        if (session?.till_id) {
          const t = await apiRequest(`/tills/${session.till_id}`).catch(() => null);
          setTill(t);
        }
        if (session?.cashier_id) {
          const u = await apiRequest(`/users/${session.cashier_id}`).catch(() => null);
          setCashierName(u?.full_name ?? u?.username ?? null);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load Z report"));
  }, [sessionId, router]);

  const session = payload?.session ?? payload?.report?.session;
  const report = payload?.report ?? payload;
  const tillName = useMemo(() => tillDisplayName(till), [till]);
  const showFloatBreakdown = isPosTillFloatRequired(capabilities?.module_settings);

  function handlePrint() {
    printPosTillReport({
      type: "Z",
      organizationName: capabilities?.profile_label ?? "POS / ERP",
      tillName,
      cashierName: cashierName ?? user?.full_name,
      report,
      session,
      variance: payload?.variance,
      showFloatBreakdown,
    });
  }

  return (
    <CatalogPageShell
      title="Z report"
      subtitle="End-of-day report for the closed session"
      action={
        <div className="flex gap-2">
          <Link href="/sales/till-management?tab=history" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Session history
          </Link>
          {payload ? (
            <PrimaryButton type="button" showIcon={false} onClick={handlePrint}>
              Print Z report
            </PrimaryButton>
          ) : null}
        </div>
      }
      banner={
        error ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        ) : null
      }
    >
      {!payload && !error ? (
        <p className="text-sm text-slate-500">Loading Z report…</p>
      ) : payload ? (
        <>
          <div className="mb-4">
            <PosStatusBadge label="Session closed" tone="closed" />
          </div>
          <PosReportView
            report={report}
            session={session}
            tillName={tillName}
            cashierName={cashierName ?? user?.full_name}
            showCashReconciliation
            variance={payload.variance}
            showFloatBreakdown={showFloatBreakdown}
          />
        </>
      ) : null}
    </CatalogPageShell>
  );
}
