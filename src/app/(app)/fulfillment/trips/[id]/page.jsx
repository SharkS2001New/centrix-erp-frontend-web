"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { DashboardErrorBanner, DashboardSummaryTable } from "@/components/dashboard/dashboard-shared";
import { printLoadingList } from "@/components/fulfillment/loading-list-print";
import { printDeliveryNote } from "@/components/fulfillment/delivery-note-print";
import { formatSaleKes, saleCustomerLabel } from "@/lib/sales";
import { SaleStatusBadge } from "@/components/sales/sales-shared";

function statusLabel(status) {
  return String(status ?? "").replace(/_/g, " ");
}

export default function TripDetailPage() {
  const { id } = useParams();
  const { organization, generalSettings } = useAuth();

  const [trip, setTrip] = useState(null);
  const [loadingList, setLoadingList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [preparedBy, setPreparedBy] = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  const [collectedCash, setCollectedCash] = useState("");

  const loadTrip = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [tripRes, listRes] = await Promise.all([
        apiRequest(`/dispatch-trips/${id}`),
        apiRequest(`/dispatch-trips/${id}/loading-list`),
      ]);
      setTrip(tripRes);
      setLoadingList(listRes.loading_list ?? listRes);
      setPreparedBy(listRes.loading_list?.prepared_by_name ?? tripRes.prepared_by_name ?? "");
      setCheckedBy(listRes.loading_list?.checked_by_name ?? tripRes.checked_by_name ?? "");
      setCollectedCash(
        tripRes.collected_cash != null ? String(tripRes.collected_cash) : "",
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load trip");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  async function runAction(path, body) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await apiRequest(path, { method: "POST", body });
      setMessage("Trip updated.");
      await loadTrip();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <CatalogPageShell title="Trip" subtitle="Loading…">
        <p className="text-sm text-slate-500">Loading trip…</p>
      </CatalogPageShell>
    );
  }

  if (!trip) {
    return (
      <CatalogPageShell title="Trip not found">
        <Link href="/fulfillment/trips" className="text-[#185FA5] hover:underline">
          Back to trips
        </Link>
      </CatalogPageShell>
    );
  }

  const lines = loadingList?.lines ?? [];
  const loadingLocked = loadingList?.status && loadingList.status !== "open";
  const canLock = trip.status === "draft" && lines.length > 0 && !loadingLocked;
  const canStart =
    ["draft", "loading"].includes(trip.status) &&
    (trip.sales?.length ?? 0) > 0 &&
    (lines.length === 0 || loadingLocked);
  const canComplete = trip.status === "in_transit";
  const showCloseReconciliation = ["in_transit", "completed"].includes(trip.status);
  const canReorder = !["completed", "cancelled"].includes(trip.status);
  const showCashSettlement =
    trip.expected_cash != null &&
    Number(trip.expected_cash) > 0 &&
    ["in_transit", "completed"].includes(trip.status);
  const orgName = organization?.organization_name ?? organization?.company_name ?? "Delivery Note";

  async function printStopDeliveryNote(sale, stopNumber) {
    setBusy(true);
    setError(null);
    try {
      const fullSale = await apiRequest(`/sales/${sale.id}`);
      printDeliveryNote({
        organizationName: orgName,
        sale: fullSale,
        trip,
        stopNumber,
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load order for delivery note");
    } finally {
      setBusy(false);
    }
  }

  const orderedSales = [...(trip.sales ?? [])].sort(
    (a, b) => (a.pivot?.stop_seq ?? 0) - (b.pivot?.stop_seq ?? 0),
  );

  async function moveStop(saleId, direction) {
    const list = [...orderedSales];
    const index = list.findIndex((s) => s.id === saleId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= list.length) return;

    [list[index], list[target]] = [list[target], list[index]];
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/dispatch-trips/${id}/reorder-stops`, {
        method: "POST",
        body: {
          stops: list.map((sale, stopIndex) => ({
            sale_id: sale.id,
            stop_seq: stopIndex + 1,
          })),
        },
      });
      setMessage("Stop order updated.");
      await loadTrip();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reorder stops");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CatalogPageShell
      title={trip.trip_code}
      subtitle={`${trip.route?.route_name ?? "Route TBD"} · ${trip.scheduled_date}`}
      action={
        showCloseReconciliation ? (
          <Link
            href={`/fulfillment/trips/${id}/close`}
            className="inline-flex items-center rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#144f8a]"
          >
            Close trip
          </Link>
        ) : null
      }
    >
      <AdminBreadcrumb
        items={[
          { label: "Fulfillment", href: "/fulfillment" },
          { label: "Trips", href: "/fulfillment/trips" },
          { label: trip.trip_code },
        ]}
      />

      <DashboardErrorBanner message={error} />
      {message ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

      <div className="mb-6 grid gap-4 theme-panel rounded-xl border p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs uppercase text-slate-500">Status</p>
          <p className="mt-1 font-medium capitalize text-slate-900">{statusLabel(trip.status)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Driver</p>
          <p className="mt-1 font-medium text-slate-900">{trip.driver?.full_name ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Vehicle</p>
          <p className="mt-1 font-medium text-slate-900">
            {trip.vehicle?.plate_number ?? trip.vehicle?.vehicle_name ?? "—"}
          </p>
          {trip.vehicle?.max_weight_kg ? (
            <p className="text-xs text-slate-500">Max {trip.vehicle.max_weight_kg} kg</p>
          ) : null}
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Orders</p>
          <p className="mt-1 font-medium text-slate-900">{trip.sales?.length ?? 0}</p>
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        <PrimaryButton
          type="button"
          showIcon={false}
          disabled={busy}
          onClick={() =>
            printLoadingList({
              organization,
              generalSettings: generalSettings(),
              organizationName: organization?.organization_name ?? organization?.company_name ?? "Loading List",
              loadingList,
              trip,
            })
          }
        >
          Print loading list
        </PrimaryButton>
        {canLock ? (
          <>
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
                runAction(`/dispatch-trips/${id}/loading-list/lock`, {
                  prepared_by_name: preparedBy.trim(),
                  checked_by_name: checkedBy.trim(),
                })
              }
            >
              Lock loading list
            </PrimaryButton>
          </>
        ) : null}
        {canStart ? (
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
            disabled={busy || (lines.length > 0 && !loadingLocked)}
            title={lines.length > 0 && !loadingLocked ? "Lock the loading list first" : undefined}
            onClick={() => runAction(`/dispatch-trips/${id}/start`)}
          >
            Start trip
          </button>
        ) : null}
        {canComplete ? (
          <Link
            href={`/fulfillment/trips/${id}/close`}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 hover:bg-emerald-100"
          >
            Close trip…
          </Link>
        ) : null}
        {trip.status !== "completed" && trip.status !== "cancelled" ? (
          <button
            type="button"
            className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-700 hover:bg-red-50"
            disabled={busy}
            onClick={() => runAction(`/dispatch-trips/${id}/cancel`)}
          >
            Cancel trip
          </button>
        ) : null}
      </div>

      {showCashSettlement ? (
        <section className="mb-8 theme-panel rounded-xl border p-5 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Cash settlement</h2>
          <p className="mt-1 text-sm text-slate-500">
            Expected COD from unpaid order balances on this trip.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <dt className="text-slate-500">Expected cash</dt>
              <dd className="font-medium text-slate-900">{formatSaleKes(trip.expected_cash)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Collected</dt>
              <dd className="font-medium text-slate-900">
                {trip.settled_at ? formatSaleKes(trip.collected_cash) : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Variance</dt>
              <dd className="font-medium text-slate-900">
                {trip.settled_at ? formatSaleKes(trip.cash_variance) : "—"}
              </dd>
            </div>
          </dl>
          {!trip.settled_at && trip.status === "in_transit" ? (
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
                  runAction(`/dispatch-trips/${id}/settle`, {
                    collected_cash: Number(collectedCash) || 0,
                  })
                }
              >
                Record settlement
              </PrimaryButton>
            </div>
          ) : trip.settled_at ? (
            <p className="mt-3 text-sm text-emerald-700">Settled at {trip.settled_at}</p>
          ) : null}
        </section>
      ) : null}

      <section className="mb-8 theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Loading list</h2>
        <p className="mt-1 text-sm text-slate-500">
          Aggregated pick quantities from mobile and route orders on this trip · Total{" "}
          {formatSaleKes(loadingList?.total_amount ?? 0)}
          {loadingList?.status ? (
            <>
              {" "}
              · Status <span className="capitalize font-medium">{loadingList.status}</span>
            </>
          ) : null}
        </p>
        <div className="mt-4">
          <DashboardSummaryTable
            columns={[
              { key: "line_no", label: "No." },
              { key: "product_name", label: "Product" },
              { key: "quantity_label", label: "Total items" },
              { key: "pack_breakdown", label: "Packaging" },
              { key: "unit_price", label: "Price", align: "right" },
              { key: "line_total", label: "Total", align: "right" },
            ]}
            rows={lines.map((line) => ({
              ...line,
              unit_price: formatSaleKes(line.unit_price),
              line_total: formatSaleKes(line.line_total),
            }))}
          />
        </div>
      </section>

      <section className="theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Delivery stops</h2>
        <p className="mt-1 text-sm text-slate-500">Sequence orders for the driver route run.</p>
        <div className="mt-4">
          <DashboardSummaryTable
            columns={[
              { key: "stop", label: "Stop" },
              {
                key: "order_num",
                label: "Order #",
                render: (row) => (
                  <Link href={`/sales/orders/${row.id}`} className="font-mono text-[#185FA5] hover:underline">
                    {row.order_num}
                  </Link>
                ),
              },
              { key: "customer", label: "Customer" },
              { key: "total", label: "Total", align: "right" },
              {
                key: "status",
                label: "Status",
                render: (row) => <SaleStatusBadge status={row.status} />,
              },
              {
                key: "print",
                label: "",
                render: (row) => (
                  <button
                    type="button"
                    className="rounded border border-slate-200 px-2 py-0.5 text-xs hover:bg-slate-50"
                    disabled={busy}
                    onClick={() => printStopDeliveryNote({ id: row.id }, row.stop)}
                  >
                    Delivery note
                  </button>
                ),
              },
              ...(canReorder
                ? [
                    {
                      key: "sequence",
                      label: "",
                      render: (row) => (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-40"
                            disabled={busy || row.stop === 1}
                            onClick={() => moveStop(row.id, "up")}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="rounded border border-slate-200 px-2 py-0.5 text-xs hover:bg-slate-50 disabled:opacity-40"
                            disabled={busy || row.stop === orderedSales.length}
                            onClick={() => moveStop(row.id, "down")}
                          >
                            ↓
                          </button>
                        </div>
                      ),
                    },
                  ]
                : []),
            ]}
            rows={orderedSales.map((sale, index) => ({
              id: sale.id,
              stop: index + 1,
              order_num: sale.order_num ?? sale.id,
              customer: saleCustomerLabel(sale),
              total: formatSaleKes(sale.order_total),
              status: sale.status,
            }))}
          />
        </div>
      </section>
    </CatalogPageShell>
  );
}
