"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";
import { P } from "@/lib/permission-codes";
import { notifyError, notifySuccess } from "@/lib/notify";
import { PrimaryButton } from "@/components/catalog/catalog-shared";
import {
  DashboardLoading,
  DashboardRefreshButton,
  DashboardSection,
  PaymentStatusBadge,
  PaymentsAccessGate,
  PaymentsEmptyState,
  PaymentsHero,
} from "@/components/centrix-payments/centrix-payments-shared";

const PROVIDER_META = {
  mpesa: { label: "M-Pesa", tone: "from-emerald-600 to-teal-700", badge: "STK · C2B" },
  equity: { label: "Equity Bank", tone: "from-sky-700 to-indigo-700", badge: "Paybill" },
  bank: { label: "Bank", tone: "from-slate-700 to-slate-900", badge: "Statements" },
};

function connectionLabel(status) {
  if (status === "connected") return "Connected";
  if (status === "needs_setup") return "Needs setup";
  return status || "Unknown";
}

function AccountCard({ row, canManage, onTest, testing }) {
  const provider = PROVIDER_META[row.provider] ?? {
    label: String(row.provider ?? "Account").toUpperCase(),
    tone: "from-slate-600 to-slate-800",
    badge: row.account_type,
  };

  return (
    <article className="theme-panel overflow-hidden rounded-2xl border shadow-sm transition hover:shadow-md">
      <div className={`bg-gradient-to-r ${provider.tone} px-5 py-4 text-white`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/75">
              {provider.label}
            </p>
            <h3 className="mt-1 text-lg font-semibold leading-tight">{row.account_name}</h3>
          </div>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide">
            {provider.badge}
          </span>
        </div>
      </div>
      <div className="space-y-3 px-5 py-4 text-sm">
        <div className="flex justify-between gap-4">
          <span className="theme-subtext">Shortcode / account</span>
          <span className="font-mono text-xs">{row.shortcode || row.account_number || "—"}</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="theme-subtext">Status</span>
          <PaymentStatusBadge status={row.status} />
        </div>
        <div className="flex justify-between gap-4">
          <span className="theme-subtext">Connection</span>
          <span className="font-medium">{connectionLabel(row.connection_status)}</span>
        </div>
        {canManage && row.provider === "mpesa" ? (
          <button
            type="button"
            disabled={testing}
            onClick={() => onTest(row.id)}
            className="theme-secondary-btn mt-2 w-full rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
          >
            {testing ? "Testing connection…" : "Test M-Pesa connection"}
          </button>
        ) : null}
      </div>
    </article>
  );
}

export function CentrixPaymentsAccountsScreen() {
  const { organization, hasPermission } = useAuth();
  const canManage = hasPermission?.(P.centrix_payments.accounts.edit);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testingId, setTestingId] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/centrix-payments/payment-accounts");
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load payment accounts");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(loadData);
  useTabTitle(tabSectionTitle("Payment Accounts", "Centrix Payments"));

  const groupedCount = useMemo(() => {
    const counts = { mpesa: 0, equity: 0, bank: 0 };
    for (const row of rows) {
      if (counts[row.provider] != null) counts[row.provider] += 1;
    }
    return counts;
  }, [rows]);

  async function syncAccounts() {
    setSyncing(true);
    try {
      await apiRequest("/centrix-payments/payment-accounts/sync", { method: "POST" });
      notifySuccess("Payment accounts synced from providers.");
      await loadData();
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  async function testConnection(id) {
    setTestingId(id);
    try {
      const res = await apiRequest(`/centrix-payments/payment-accounts/${id}/test`, {
        method: "POST",
      });
      notifySuccess(res?.message || "Connection test successful.");
      await loadData();
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Connection test failed");
    } finally {
      setTestingId(null);
    }
  }

  return (
    <PaymentsAccessGate permission={P.centrix_payments.accounts.view} title="Payment accounts">
      <div className="space-y-8 pb-8">
        <PaymentsHero
          organizationName={organization?.org_name}
          subtitle="Every M-Pesa paybill, Equity collection account, and bank connection your organization uses to receive and reconcile payments."
          action={
            <div className="flex flex-wrap gap-2">
              {canManage ? (
                <PrimaryButton type="button" onClick={() => void syncAccounts()} disabled={syncing}>
                  {syncing ? "Syncing…" : "Sync providers"}
                </PrimaryButton>
              ) : null}
              <DashboardRefreshButton onClick={loadData} loading={loading} className="!border-white/30 !bg-white/15 !text-white hover:!bg-white/25" />
            </div>
          }
        />

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { key: "mpesa", label: "M-Pesa accounts", href: "/centrix-payments/settings/paybills" },
            { key: "equity", label: "Equity accounts", href: "/centrix-payments/settings/equity" },
            { key: "bank", label: "Bank accounts", href: "/centrix-payments/accounts" },
          ].map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="theme-panel rounded-xl border px-4 py-3 text-sm shadow-sm transition hover:border-teal-500/40"
            >
              <p className="theme-subtext text-xs uppercase tracking-wide">{item.label}</p>
              <p className="theme-heading mt-1 text-2xl font-semibold tabular-nums">
                {groupedCount[item.key] ?? 0}
              </p>
            </Link>
          ))}
        </div>

        <DashboardSection
          title="Connected accounts"
          subtitle="Unified view across M-Pesa, Equity, and bank providers"
        >
          {loading ? (
            <DashboardLoading label="Loading payment accounts…" />
          ) : rows.length === 0 ? (
            <PaymentsEmptyState
              title="No payment accounts yet"
              description="Add M-Pesa paybills and Equity collection accounts, then sync to see them here."
              actionHref="/centrix-payments/settings/paybills"
              actionLabel="Configure M-Pesa paybills"
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((row) => (
                <AccountCard
                  key={row.id}
                  row={row}
                  canManage={canManage}
                  testing={testingId === row.id}
                  onTest={(id) => void testConnection(id)}
                />
              ))}
            </div>
          )}
        </DashboardSection>
      </div>
    </PaymentsAccessGate>
  );
}
