"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";
import { P } from "@/lib/permission-codes";
import { notifyError } from "@/lib/notify";
import { formatKesCompact } from "@/components/catalog/catalog-shared";
import {
  DashboardErrorBanner,
  DashboardLoading,
  DashboardRefreshButton,
  PaymentsAccessGate,
  PaymentsAttentionStrip,
  PaymentsKpiGrid,
} from "@/components/centrix-payments/centrix-payments-shared";

export function CentrixPaymentsDashboardScreen() {
  const { hasPermission } = useAuth();
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dashboard = await apiRequest("/centrix-payments/dashboard");
      setPayload(dashboard);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load payments dashboard");
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(loadData);
  useTabTitle(tabSectionTitle("Overview", "Centrix Payments"));

  const totals = payload?.totals ?? {};
  const availability = payload?.availability ?? {};
  const canViewTransactions = hasPermission?.(P.centrix_payments.transactions.view);

  const subtitle = useMemo(() => {
    const parts = [];
    if (totals.pending_payments > 0) parts.push(`${totals.pending_payments} pending`);
    const exceptions = (totals.failed_payments ?? 0) + (totals.unmatched_payments ?? 0);
    if (exceptions > 0) parts.push(`${exceptions} need attention`);
    if (parts.length === 0) return "Today's collections and payment health";
    return `Today's collections · ${parts.join(" · ")}`;
  }, [totals]);

  return (
    <PaymentsAccessGate permission={P.centrix_payments.dashboard.view} title="Overview">
      <CatalogPageShell
        title="Payments overview"
        subtitle={subtitle}
        action={<DashboardRefreshButton onClick={loadData} loading={loading} />}
      >
        <DashboardErrorBanner message={error} />

        {loading && !payload ? (
          <DashboardLoading label="Loading payments overview…" />
        ) : (
          <div className="space-y-6">
            <PaymentsKpiGrid
              items={[
                {
                  id: "collections",
                  label: "Today's collections",
                  value: formatKesCompact(totals.today_collections ?? 0),
                  hint: "STK, C2B, and recorded payments",
                },
                {
                  id: "successful",
                  label: "Successful",
                  value: String(totals.successful_payments ?? 0),
                  hint: "Completed today",
                },
                {
                  id: "pending",
                  label: "Pending",
                  value: String(totals.pending_payments ?? 0),
                  hint: "Awaiting callback",
                },
                {
                  id: "exceptions",
                  label: "Needs attention",
                  value: String((totals.failed_payments ?? 0) + (totals.unmatched_payments ?? 0)),
                  hint: "Failed or unmatched",
                },
              ]}
            />

            <PaymentsAttentionStrip
              availability={availability}
              totals={totals}
              hasPermission={hasPermission}
            />

            {canViewTransactions ? (
              <p className="theme-subtext text-sm">
                Open the{" "}
                <Link href="/centrix-payments/transactions" className="theme-link font-medium">
                  transaction ledger
                </Link>{" "}
                for the full history, or use{" "}
                <Link href="/centrix-payments/accounts" className="theme-link font-medium">
                  payment accounts
                </Link>{" "}
                to review connected channels.
              </p>
            ) : null}
          </div>
        )}
      </CatalogPageShell>
    </PaymentsAccessGate>
  );
}
