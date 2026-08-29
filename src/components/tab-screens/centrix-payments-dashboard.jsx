"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { apiRequest } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";
import { isCentrixPaymentsEnabled } from "@/lib/platform-org-features";
import { P } from "@/lib/permission-codes";
import { notifyError } from "@/lib/notify";
import {
  CatalogPageShell,
  SECONDARY_BTN_CLASS,
  StatCard,
  formatKesCompact,
} from "@/components/catalog/catalog-shared";

export function CentrixPaymentsDashboardScreen() {
  const { capabilities, hasPermission } = useAuth();
  const enabled = isCentrixPaymentsEnabled(capabilities);
  const canView = enabled && hasPermission?.(P.centrix_payments.dashboard.view);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!canView) {
      setPayload(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest("/centrix-payments/dashboard");
      setPayload(data);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load payments dashboard");
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useTabAwareDataLoad(loadData);
  useTabTitle(tabSectionTitle("Dashboard", "Centrix Payments"));

  const totals = payload?.totals ?? {};
  const availability = payload?.availability ?? {};

  return (
    <CatalogPageShell
      title="Centrix Payments"
      subtitle="Collections, pending payments, and reconciliation exceptions"
      action={
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          onClick={() => void loadData()}
          disabled={loading || !canView}
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      }
    >
      {!enabled ? (
        <p className="text-sm text-amber-800">
          Centrix Payments is disabled for this organization. Platform admin can enable it under
          organization settings.
        </p>
      ) : !canView ? (
        <p className="text-sm text-slate-600">You do not have permission to view Centrix Payments.</p>
      ) : loading && !payload ? (
        <p className="text-sm text-slate-500">Loading dashboard…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard
              label="Today's collections"
              value={formatKesCompact(totals.today_collections ?? 0)}
            />
            <StatCard label="Successful" value={String(totals.successful_payments ?? 0)} />
            <StatCard label="Pending" value={String(totals.pending_payments ?? 0)} />
            <StatCard label="Failed" value={String(totals.failed_payments ?? 0)} />
            <StatCard label="Unmatched" value={String(totals.unmatched_payments ?? 0)} />
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
            <p>
              M-Pesa STK:{" "}
              <span className="font-medium">
                {availability.mpesa_stk_available ? "Available" : "Not available"}
              </span>
            </p>
            <p>
              M-Pesa configured:{" "}
              <span className="font-medium">{availability.mpesa_configured ? "Yes" : "No"}</span>
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/centrix-payments/accounts" className={SECONDARY_BTN_CLASS}>
              Payment accounts
            </Link>
            <Link href="/centrix-payments/transactions" className={SECONDARY_BTN_CLASS}>
              Transactions
            </Link>
            <Link href="/centrix-payments/reconciliation" className={SECONDARY_BTN_CLASS}>
              Reconciliation
            </Link>
          </div>
        </div>
      )}
    </CatalogPageShell>
  );
}
