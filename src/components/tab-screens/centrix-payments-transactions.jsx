"use client";

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
  formatKesCompact,
  formatShortDate,
} from "@/components/catalog/catalog-shared";

export function CentrixPaymentsTransactionsScreen() {
  const { capabilities, hasPermission } = useAuth();
  const enabled = isCentrixPaymentsEnabled(capabilities);
  const canView = enabled && hasPermission?.(P.centrix_payments.transactions.view);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!canView) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest("/centrix-payments/transactions", {
        searchParams: { limit: 100 },
      });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load transactions");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [canView]);

  useTabAwareDataLoad(loadData);
  useTabTitle(tabSectionTitle("Transactions", "Centrix Payments"));

  return (
    <CatalogPageShell
      title="Transactions"
      subtitle="STK requests, M-Pesa C2B, and recorded sale payments"
      action={
        <button
          type="button"
          className={SECONDARY_BTN_CLASS}
          onClick={() => void loadData()}
          disabled={loading}
        >
          Refresh
        </button>
      }
    >
      {!enabled ? (
        <p className="text-sm text-amber-800">Centrix Payments is disabled for this organization.</p>
      ) : !canView ? (
        <p className="text-sm text-slate-600">You do not have permission to view transactions.</p>
      ) : loading ? (
        <p className="text-sm text-slate-500">Loading transactions…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">No transactions yet.</p>
      ) : (
        <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="theme-table-head-row text-left text-xs font-medium">
                  <th className="px-3 py-2">Source</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Reference</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="theme-table-row border-t border-slate-100">
                    <td className="px-3 py-2">{row.source}</td>
                    <td className="px-3 py-2 uppercase">{row.provider}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {row.centrix_reference || row.provider_transaction_id || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatKesCompact(row.amount ?? 0)}
                    </td>
                    <td className="px-3 py-2">{row.status}</td>
                    <td className="px-3 py-2">{formatShortDate(row.transaction_date)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{row.mpesa_receipt || "—"}</td>
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
