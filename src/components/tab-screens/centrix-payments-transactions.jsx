"use client";

import { useCallback, useMemo, useState } from "react";
import { CatalogPageShell } from "@/components/catalog/catalog-shared";
import { apiRequest } from "@/lib/api";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { useTabTitle } from "@/contexts/tab-workspace-context";
import { tabSectionTitle } from "@/hooks/use-tab-form-exit";
import { P } from "@/lib/permission-codes";
import { notifyError } from "@/lib/notify";
import {
  DashboardLoading,
  DashboardPanel,
  DashboardRefreshButton,
  DashboardSummaryTable,
  PaymentStatusBadge,
  PaymentsAccessGate,
  PaymentsEmptyState,
  formatTransactionRow,
} from "@/components/centrix-payments/centrix-payments-shared";

const STATUS_FILTERS = [
  { id: "all", label: "All" },
  { id: "success", label: "Successful" },
  { id: "pending", label: "Pending" },
  { id: "failed", label: "Failed" },
];

function matchesFilter(row, filter) {
  if (filter === "all") return true;
  const status = String(row.status ?? "").toLowerCase();
  if (filter === "success") {
    return ["completed", "success", "paid", "matched"].includes(status);
  }
  if (filter === "pending") {
    return ["pending", "processing", "unmatched"].includes(status);
  }
  if (filter === "failed") {
    return ["failed", "cancelled", "error", "rejected"].includes(status);
  }
  return true;
}

export function CentrixPaymentsTransactionsScreen() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/centrix-payments/transactions", {
        searchParams: { limit: 200 },
      });
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load transactions");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(loadData);
  useTabTitle(tabSectionTitle("Transactions", "Centrix Payments"));

  const filteredRows = useMemo(
    () => rows.filter((row) => matchesFilter(row, filter)).map(formatTransactionRow),
    [rows, filter],
  );

  const counts = useMemo(() => {
    const out = { all: rows.length, success: 0, pending: 0, failed: 0 };
    for (const row of rows) {
      if (matchesFilter(row, "success")) out.success += 1;
      if (matchesFilter(row, "pending")) out.pending += 1;
      if (matchesFilter(row, "failed")) out.failed += 1;
    }
    return out;
  }, [rows]);

  return (
    <PaymentsAccessGate permission={P.centrix_payments.transactions.view} title="Transactions">
      <CatalogPageShell
        title="Transaction ledger"
        subtitle="STK push requests, M-Pesa C2B notifications, and sale payments recorded in Centrix."
        action={<DashboardRefreshButton onClick={loadData} loading={loading} />}
      >
        <div className="space-y-6 pb-4">
          <div className="flex flex-wrap gap-2">
            {STATUS_FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  filter === item.id
                    ? "bg-teal-700 text-white shadow-sm"
                    : "theme-panel border text-slate-600 hover:border-teal-500/40"
                }`}
              >
                {item.label}
                <span className="ml-1.5 tabular-nums opacity-80">({counts[item.id] ?? 0})</span>
              </button>
            ))}
          </div>

          {loading ? (
            <DashboardLoading label="Loading transactions…" />
          ) : filteredRows.length === 0 ? (
            <PaymentsEmptyState
              title={rows.length === 0 ? "No transactions yet" : "No transactions in this filter"}
              description={
                rows.length === 0
                  ? "Once you start collecting via STK or C2B, payments will appear here."
                  : "Try another status filter."
              }
              actionHref={rows.length === 0 ? "/centrix-payments/settings/mpesa" : undefined}
              actionLabel="Configure M-Pesa"
            />
          ) : (
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
                  { key: "receipt", label: "Receipt", mono: true },
                ]}
                rows={filteredRows}
                emptyMessage="No transactions"
              />
            </DashboardPanel>
          )}
        </div>
      </CatalogPageShell>
    </PaymentsAccessGate>
  );
}
