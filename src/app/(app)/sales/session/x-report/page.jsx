"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { usePosSession } from "@/contexts/pos-session-context";
import { CatalogPageShell, PrimaryButton } from "@/components/catalog/catalog-shared";
import { PosReportView } from "@/components/pos/pos-report-view";
import { printPosTillReport } from "@/components/pos/pos-shared";
import { tillDisplayName } from "@/lib/pos-till";
import { isPosTillFloatRequired } from "@/lib/sales-settings";

export default function XReportPage() {
  const router = useRouter();
  const { user, capabilities } = useAuth();
  const { activeSession, sessionReport, refreshReport } = usePosSession();
  const [till, setTill] = useState(null);
  const [cashierName, setCashierName] = useState(null);

  useEffect(() => {
    if (!activeSession) {
      router.replace("/sales/pos");
      return;
    }
    refreshReport(activeSession.id);
    if (activeSession.till_id) {
      apiRequest(`/tills/${activeSession.till_id}`).then(setTill).catch(() => setTill(null));
    }
    if (activeSession.cashier_id) {
      apiRequest(`/users/${activeSession.cashier_id}`)
        .then((u) => setCashierName(u.full_name ?? u.username))
        .catch(() => setCashierName(user?.full_name ?? null));
    }
  }, [activeSession, refreshReport, router, user?.full_name]);

  const tillName = useMemo(() => tillDisplayName(till), [till]);
  const showFloatBreakdown = isPosTillFloatRequired(capabilities?.module_settings);

  function handlePrint() {
    printPosTillReport({
      type: "X",
      organizationName: capabilities?.profile_label ?? "POS / ERP",
      tillName,
      cashierName: cashierName ?? user?.full_name,
      report: sessionReport,
      session: activeSession,
      showFloatBreakdown,
    });
  }

  if (!activeSession) return null;

  return (
    <CatalogPageShell
      title="X report"
      subtitle="Interim snapshot — session remains open"
      action={
        <div className="flex gap-2">
          <Link href="/sales/pos" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Back to session
          </Link>
          <PrimaryButton type="button" showIcon={false} onClick={handlePrint}>
            Print report
          </PrimaryButton>
        </div>
      }
    >
      <PosReportView
        report={sessionReport}
        session={activeSession}
        tillName={tillName}
        cashierName={cashierName ?? user?.full_name}
        showFloatBreakdown={showFloatBreakdown}
      />
      <p className="mt-4 text-center text-xs text-slate-500">Session still open — this is not an end-of-day Z report.</p>
    </CatalogPageShell>
  );
}
