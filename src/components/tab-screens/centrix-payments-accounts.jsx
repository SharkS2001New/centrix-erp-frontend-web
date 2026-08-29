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
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  CatalogPageShell,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
} from "@/components/catalog/catalog-shared";

function connectionLabel(status) {
  if (status === "connected") return "Connected";
  if (status === "needs_setup") return "Needs setup";
  return status || "Unknown";
}

export function CentrixPaymentsAccountsScreen() {
  const { capabilities, hasPermission } = useAuth();
  const enabled = isCentrixPaymentsEnabled(capabilities);
  const canView = enabled && hasPermission?.(P.centrix_payments.accounts.view);
  const canManage = enabled && hasPermission?.(P.centrix_payments.accounts.edit);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [testingId, setTestingId] = useState(null);

  const loadData = useCallback(async () => {
    if (!canView) {
      setRows([]);
      setLoading(false);
      return;
    }
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
  }, [canView]);

  useTabAwareDataLoad(loadData);
  useTabTitle(tabSectionTitle("Payment Accounts", "Centrix Payments"));

  async function syncAccounts() {
    setSyncing(true);
    try {
      await apiRequest("/centrix-payments/payment-accounts/sync", { method: "POST" });
      notifySuccess("Payment accounts synced.");
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
    <CatalogPageShell
      title="Payment Accounts"
      subtitle="M-Pesa, Equity, and bank accounts configured for this organization"
      action={
        <div className="flex flex-wrap gap-2">
          {canManage ? (
            <PrimaryButton type="button" onClick={() => void syncAccounts()} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync from providers"}
            </PrimaryButton>
          ) : null}
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            onClick={() => void loadData()}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      }
    >
      {!enabled ? (
        <p className="text-sm text-amber-800">Centrix Payments is disabled for this organization.</p>
      ) : !canView ? (
        <p className="text-sm text-slate-600">You do not have permission to view payment accounts.</p>
      ) : loading ? (
        <p className="text-sm text-slate-500">Loading payment accounts…</p>
      ) : rows.length === 0 ? (
        <div className="space-y-3 text-sm text-slate-600">
          <p>No payment accounts yet.</p>
          <Link href="/centrix-payments/mpesa" className="text-[var(--brand-primary)]">
            Configure M-Pesa accounts
          </Link>
        </div>
      ) : (
        <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs font-medium">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Shortcode / Account</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Connection</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="theme-table-row border-t border-slate-100">
                    <td className="px-3 py-2 font-medium">{row.account_name}</td>
                    <td className="px-3 py-2 uppercase">{row.provider}</td>
                    <td className="px-3 py-2">{row.account_type}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.shortcode || row.account_number || "—"}
                    </td>
                    <td className="px-3 py-2 capitalize">{row.status}</td>
                    <td className="px-3 py-2">{connectionLabel(row.connection_status)}</td>
                    <td className="px-3 py-2">
                      {canManage && row.provider === "mpesa" ? (
                        <button
                          type="button"
                          className={SECONDARY_BTN_CLASS}
                          disabled={testingId === row.id}
                          onClick={() => void testConnection(row.id)}
                        >
                          {testingId === row.id ? "Testing…" : "Test connection"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </CatalogPageShell>
  );
}
