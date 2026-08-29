"use client";

import { useCallback, useMemo, useState } from "react";
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
  DashboardPanel,
  DashboardRefreshButton,
  DashboardSection,
  DashboardSummaryTable,
  filterPaymentsLinks,
  formatTransactionRow,
  PAYMENTS_QUICK_GROUPS,
  PaymentStatusBadge,
  PaymentsAccessGate,
  PaymentsHero,
  PaymentsKpiGrid,
  PaymentsProviderGrid,
  PaymentsQuickLinkGroups,
  PaymentsSetupGuide,
} from "@/components/centrix-payments/centrix-payments-shared";

export function CentrixPaymentsDashboardScreen() {
  const { organization, hasPermission } = useAuth();
  const [payload, setPayload] = useState(null);
  const [recentRows, setRecentRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboard, transactions] = await Promise.all([
        apiRequest("/centrix-payments/dashboard"),
        apiRequest("/centrix-payments/transactions", { searchParams: { limit: 8 } }).catch(() => ({
          data: [],
        })),
      ]);
      setPayload(dashboard);
      setRecentRows(Array.isArray(transactions?.data) ? transactions.data : []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load payments dashboard");
      setError(e instanceof Error ? e.message : "Failed to load dashboard");
      setPayload(null);
      setRecentRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(loadData);
  useTabTitle(tabSectionTitle("Overview", "Centrix Payments"));

  const totals = payload?.totals ?? {};
  const availability = payload?.availability ?? {};
  const recentTableRows = useMemo(() => recentRows.map(formatTransactionRow), [recentRows]);
  const quickGroups = useMemo(
    () => filterPaymentsLinks(PAYMENTS_QUICK_GROUPS, hasPermission),
    [hasPermission],
  );

  return (
    <PaymentsAccessGate permission={P.centrix_payments.dashboard.view} title="Overview">
      <div className="space-y-8 pb-8">
        <PaymentsHero
          organizationName={organization?.org_name}
          subtitle="Monitor collections, configure M-Pesa and bank channels, and reconcile incoming payments — all in one place."
          action={<DashboardRefreshButton onClick={loadData} loading={loading} className="!border-white/30 !bg-white/15 !text-white hover:!bg-white/25" />}
        />

        <DashboardErrorBanner message={error} />

        {loading && !payload ? (
          <DashboardLoading label="Loading payments overview…" />
        ) : (
          <>
            <DashboardSection title="Today at a glance" subtitle="Collections and payment health for your organization">
              <PaymentsKpiGrid
                items={[
                  {
                    id: "collections",
                    label: "Today's collections",
                    value: formatKesCompact(totals.today_collections ?? 0),
                    hint: "STK, C2B, and recorded sale payments",
                  },
                  {
                    id: "successful",
                    label: "Successful",
                    value: String(totals.successful_payments ?? 0),
                    hint: "Completed payment requests",
                  },
                  {
                    id: "pending",
                    label: "Pending",
                    value: String(totals.pending_payments ?? 0),
                    hint: "Awaiting customer or callback",
                  },
                  {
                    id: "exceptions",
                    label: "Needs attention",
                    value: String((totals.failed_payments ?? 0) + (totals.unmatched_payments ?? 0)),
                    hint: `${totals.failed_payments ?? 0} failed · ${totals.unmatched_payments ?? 0} unmatched`,
                  },
                ]}
              />
            </DashboardSection>

            <PaymentsSetupGuide availability={availability} hasPermission={hasPermission} />

            <DashboardSection
              title="Payment channels"
              subtitle="Connection status for M-Pesa, Equity, and bank accounts"
            >
              <PaymentsProviderGrid availability={availability} hasPermission={hasPermission} />
            </DashboardSection>

            {hasPermission?.(P.centrix_payments.transactions.view) ? (
              <DashboardSection
                title="Recent transactions"
                subtitle="Latest STK requests, C2B payments, and sale collections"
                action={
                  <DashboardRefreshButton onClick={loadData} loading={loading} />
                }
              >
                <DashboardPanel className="!p-0 overflow-hidden">
                  <DashboardSummaryTable
                    columns={[
                      { key: "source", label: "Source" },
                      { key: "provider", label: "Provider" },
                      { key: "reference", label: "Reference", mono: true },
                      { key: "amount", label: "Amount", align: "right" },
                      {
                        key: "status",
                        label: "Status",
                        render: (row) => <PaymentStatusBadge status={row.status} />,
                      },
                      { key: "date", label: "Date" },
                    ]}
                    rows={recentTableRows}
                    emptyMessage="No payments recorded yet. Configure M-Pesa or connect a paybill to start collecting."
                    viewAllHref="/centrix-payments/transactions"
                    viewAllLabel="Open transaction ledger →"
                  />
                </DashboardPanel>
              </DashboardSection>
            ) : null}

            <PaymentsQuickLinkGroups groups={quickGroups} />
          </>
        )}
      </div>
    </PaymentsAccessGate>
  );
}
