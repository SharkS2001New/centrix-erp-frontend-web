"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { DashboardKpiGrid, DashboardSummaryTable } from "@/components/dashboard/dashboard-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { formatSaleKes } from "@/lib/sales";
import { SaleStatusBadge } from "@/components/sales/sales-shared";

function varianceTone(variance) {
  if (variance == null) return "text-slate-900";
  const v = Number(variance);
  if (Math.abs(v) < 0.01) return "text-emerald-700";
  return v < 0 ? "text-red-700" : "text-amber-700";
}

function StepChecklist({ steps }) {
  return (
    <ol className="space-y-3">
      {steps.map((step) => (
        <li
          key={step.id}
          className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
            step.done
              ? "border-emerald-200 bg-emerald-50/60"
              : step.required
                ? "border-slate-200 bg-white"
                : "border-slate-100 bg-slate-50/50"
          }`}
        >
          <span
            className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              step.done ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-600"
            }`}
            aria-hidden
          >
            {step.done ? "✓" : "·"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="font-medium text-slate-900">{step.label}</span>
            {step.detail ? (
              <span className="mt-0.5 block text-sm text-slate-500">{step.detail}</span>
            ) : null}
            {!step.required ? (
              <span className="mt-0.5 block text-xs text-slate-400">Optional</span>
            ) : null}
          </span>
        </li>
      ))}
    </ol>
  );
}

export function TripCloseReconciliation({ tripId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [collectedCash, setCollectedCash] = useState("");
  const [preparedBy, setPreparedBy] = useState("");
  const [checkedBy, setCheckedBy] = useState("");

  const loadReconciliation = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/dispatch-trips/${tripId}/reconciliation`);
      setData(res);
      setCollectedCash(
        res.cash?.collected_cash != null ? String(res.cash.collected_cash) : "",
      );
      setPreparedBy(res.loading_list?.prepared_by_name ?? "");
      setCheckedBy(res.loading_list?.checked_by_name ?? "");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load reconciliation");
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    loadReconciliation();
  }, [loadReconciliation]);

  async function runAction(path, body) {
    setBusy(true);
    try {
      await apiRequest(path, { method: "POST", body });
      notifySuccess("Trip updated.");
      await loadReconciliation();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <CatalogPageShell title="Trip close" subtitle="Loading reconciliation…">
        <p className="text-sm text-slate-500">Loading…</p>
      </CatalogPageShell>
    );
  }

  if (!data?.trip) {
    return (
      <CatalogPageShell title="Trip not found">
        <Link href="/fulfillment/trips" className="text-[#185FA5] hover:underline">
          Back to trips
        </Link>
      </CatalogPageShell>
    );
  }

  const { trip, loading_list: loadingList, delivery, cash, orders, steps, blockers, settings } = data;
  const isClosed = trip.status === "completed";
  const showSettlement = settings?.enable_cod_reconciliation && Number(cash?.expected_cash ?? 0) >= 0;

  const kpiItems = [
    {
      id: "orders",
      label: "Deliveries",
      value: `${delivery.delivered_count}/${delivery.order_count}`,
      hint: delivery.pending_count ? `${delivery.pending_count} pending` : "All delivered",
    },
    {
      id: "loading",
      label: "Loading list",
      value: loadingList.line_count ? String(loadingList.status).replace(/_/g, " ") : "—",
      hint: loadingList.line_count ? `${loadingList.line_count} lines` : "No stock lines",
    },
    {
      id: "expected",
      label: "Expected COD",
      value: showSettlement ? formatSaleKes(cash.expected_cash) : "—",
      hint: showSettlement ? "Unpaid balances" : "COD off",
    },
    {
      id: "variance",
      label: "Cash variance",
      value: cash.settled_at ? formatSaleKes(cash.cash_variance) : "—",
      hint: cash.settled_at ? "After settlement" : "Not settled",
    },
  ];

  return (
    <CatalogPageShell
      title={`Close trip · ${trip.trip_code}`}
      subtitle={`${trip.route_name ?? "Route TBD"} · ${trip.driver_name ?? "No driver"} · ${trip.scheduled_date}`}
      action={
        <Link
          href={`/fulfillment/trips/${tripId}`}
          className="text-sm font-medium text-[#185FA5] hover:underline"
        >
          Trip details
        </Link>
      }
    >
      <AdminBreadcrumb
        items={[
          { label: "Distribution", href: "/fulfillment" },
          { label: "Trips", href: "/fulfillment/trips" },
          { label: trip.trip_code, href: `/fulfillment/trips/${tripId}` },
          { label: "Close trip" },
        ]}
      />

      {isClosed ? (
        <p className="mb-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          This trip is closed. Reconciliation is read-only.
        </p>
      ) : null}

      <DashboardKpiGrid items={kpiItems} />

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Close checklist</h2>
          <p className="mt-1 text-sm text-slate-500">Complete each step before closing the trip.</p>
          <div className="mt-4">
            <StepChecklist steps={steps} />
          </div>
          {!isClosed && blockers?.length ? (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-medium">Before you can close:</p>
              <ul className="mt-2 list-disc pl-5">
                {blockers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="theme-panel rounded-xl border p-5 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Cash reconciliation</h2>
          {!showSettlement ? (
            <p className="mt-2 text-sm text-slate-500">
              COD reconciliation is disabled. Enable it in Admin → Settings → Distribution.
            </p>
          ) : (
            <>
              <dl className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
                <div>
                  <dt className="text-slate-500">Expected</dt>
                  <dd className="font-medium text-slate-900">{formatSaleKes(cash.expected_cash)}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Collected</dt>
                  <dd className="font-medium text-slate-900">
                    {cash.settled_at ? formatSaleKes(cash.collected_cash) : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Variance</dt>
                  <dd className={`font-medium ${varianceTone(cash.cash_variance)}`}>
                    {cash.settled_at ? formatSaleKes(cash.cash_variance) : "—"}
                  </dd>
                </div>
              </dl>
              {data.can_settle && !isClosed ? (
                <div className="mt-4 flex flex-wrap items-end gap-3">
                  <Field label="Collected cash">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      className={inputClassName()}
                      value={collectedCash}
                      onChange={(e) => setCollectedCash(e.target.value)}
                    />
                  </Field>
                  <PrimaryButton
                    type="button"
                    showIcon={false}
                    disabled={busy || collectedCash === ""}
                    onClick={() =>
                      runAction(`/dispatch-trips/${tripId}/settle`, {
                        collected_cash: Number(collectedCash) || 0,
                      })
                    }
                  >
                    Record settlement
                  </PrimaryButton>
                </div>
              ) : cash.settled_at ? (
                <p className="mt-3 text-sm text-emerald-700">Settled {cash.settled_at}</p>
              ) : null}
            </>
          )}

          {!isClosed && trip.status === "draft" && loadingList.line_count > 0 && loadingList.status === "open" ? (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">Lock loading list</h3>
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <Field label="Prepared by">
                  <input className={inputClassName()} value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} />
                </Field>
                <Field label="Checked by">
                  <input className={inputClassName()} value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} />
                </Field>
                <PrimaryButton
                  type="button"
                  showIcon={false}
                  disabled={busy || !preparedBy.trim() || !checkedBy.trim()}
                  onClick={() =>
                    runAction(`/dispatch-trips/${tripId}/loading-list/lock`, {
                      prepared_by_name: preparedBy.trim(),
                      checked_by_name: checkedBy.trim(),
                    })
                  }
                >
                  Lock list
                </PrimaryButton>
              </div>
            </div>
          ) : null}

          {!isClosed && data.can_start ? (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <PrimaryButton
                type="button"
                showIcon={false}
                disabled={busy}
                onClick={() => runAction(`/dispatch-trips/${tripId}/start`)}
              >
                Start trip (depart)
              </PrimaryButton>
            </div>
          ) : null}

          {!isClosed && data.can_complete ? (
            <div className="mt-6 border-t border-slate-100 pt-4">
              <PrimaryButton
                type="button"
                showIcon={false}
                disabled={busy}
                onClick={() => runAction(`/dispatch-trips/${tripId}/complete`)}
              >
                Close trip
              </PrimaryButton>
            </div>
          ) : null}
        </section>
      </div>

      <section className="mt-8 theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Order cash breakdown</h2>
        <p className="mt-1 text-sm text-slate-500">
          COD due is the unpaid balance on each route order.
        </p>
        <div className="mt-4">
          <DashboardSummaryTable
            columns={[
              { key: "stop_seq", label: "Stop" },
              {
                key: "order_num",
                label: "Order",
                render: (row) => (
                  <Link href={`/sales/orders/${row.id}`} className="font-mono text-[#185FA5] hover:underline">
                    {row.order_num}
                  </Link>
                ),
              },
              { key: "customer_name", label: "Customer" },
              {
                key: "status",
                label: "Status",
                render: (row) => <SaleStatusBadge status={row.status} />,
              },
              { key: "order_total", label: "Total", align: "right" },
              { key: "amount_paid", label: "Paid", align: "right" },
              { key: "balance_due", label: "COD due", align: "right" },
              {
                key: "pod_captured",
                label: "POD",
                render: (row) => (row.pod_captured ? "Yes" : row.is_delivered ? "Missing" : "—"),
              },
            ]}
            rows={orders.map((row) => ({
              ...row,
              customer_name: row.customer_name ?? "—",
              order_total: formatSaleKes(row.order_total),
              amount_paid: formatSaleKes(row.amount_paid),
              balance_due: formatSaleKes(row.balance_due),
            }))}
          />
        </div>
      </section>

      {loadingList.line_count > 0 ? (
        <section className="mt-8 theme-panel rounded-xl border p-5 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Loading summary</h2>
          <p className="mt-1 text-sm text-slate-500">
            {loadingList.line_count} product lines · Total {formatSaleKes(loadingList.total_amount)} · Status{" "}
            <span className="capitalize">{loadingList.status}</span>
          </p>
        </section>
      ) : null}
    </CatalogPageShell>
  );
}
