"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabDetailTitle, tabSectionTitle } from "@/hooks/use-tab-form-exit";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import { notifyError } from "@/lib/notify";
import { P } from "@/lib/permission-codes";
import { isPlatformInvestorsEnabled } from "@/lib/platform-org-features";
import { SECONDARY_BTN_CLASS } from "@/components/catalog/catalog-shared";
import { usePageNavigationReady } from "@/lib/use-page-navigation-ready";
import {
  INVESTOR_REPORT_KINDS,
  InvestorReportsView,
} from "@/components/investors/investor-reports-view";

export function InvestorsReportsIdScreen() {
  const params = useParams();
  const searchParams = useSearchParams();
  const investorId = params.id;
  const initialKind = searchParams.get("kind") || "sales";
  const { capabilities, hasPermission } = useAuth();
  const enabled = isPlatformInvestorsEnabled(capabilities);
  const canView =
    enabled &&
    (hasPermission?.(P.investors.reports.view) || hasPermission?.(P.investors.investors.view));

  const [investor, setInvestor] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadInvestor = useCallback(async () => {
    if (!canView || !investorId) {
      setInvestor(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest(`/investors/${investorId}`);
      setInvestor(data?.data ?? null);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load investor");
      setInvestor(null);
    } finally {
      setLoading(false);
    }
  }, [canView, investorId]);

  useTabAwareDataLoad(loadInvestor);
  usePageNavigationReady(!loading);

  useTabTitle(
    investor
      ? tabDetailTitle(
          "Reports",
          investor.investor_name || investor.investor_code || investorId,
        )
      : tabSectionTitle("Reports", "Investors"),
  );

  const kindLabel =
    INVESTOR_REPORT_KINDS.find((k) => k.id === initialKind)?.label ?? "Reports";

  return (
    <div className="theme-workspace min-h-full">
      <AppBreadcrumb
        items={[
          { label: "Investors", href: "/investors" },
          { label: "Reports", href: "/investors/reports" },
          {
            label: investor?.investor_name || investor?.investor_code || "Investor",
          },
        ]}
      />

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="theme-heading text-xl font-medium">
            {investor
              ? `${investor.investor_name || investor.investor_code || "Investor"} — reports`
              : "Investor report"}
          </h1>
          <p className="theme-subtext mt-0.5 text-sm">
            {investor
              ? [investor.investor_code, kindLabel].filter(Boolean).join(" · ")
              : "Sales, stock balance, and money-flow for this investor"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/investors/reports" className={SECONDARY_BTN_CLASS}>
            All investor reports
          </Link>
          {investorId ? (
            <Link href={`/investors/${investorId}`} className={SECONDARY_BTN_CLASS}>
              Investor profile
            </Link>
          ) : null}
        </div>
      </div>

      {!enabled ? (
        <p className="text-sm text-amber-800">Investors are disabled for this organization.</p>
      ) : loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !investor ? (
        <p className="text-sm text-slate-600">Investor not found.</p>
      ) : (
        <InvestorReportsView
          investorId={investorId}
          investor={investor}
          canView={canView}
          initialKind={initialKind}
        />
      )}
    </div>
  );
}
