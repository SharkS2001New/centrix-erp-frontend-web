"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { DashboardSummaryTable } from "@/components/dashboard/dashboard-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { printLoadingList } from "@/components/fulfillment/loading-list-print";
import { formatTripRoutesLabel } from "@/lib/trip-routes";
import { printDeliveryNote } from "@/components/fulfillment/delivery-note-print";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { resolveLoadingSheetPrintSettings } from "@/lib/loading-sheet-print-settings";
import { formatOrderNumber, formatSaleKes, saleCustomerLabel } from "@/lib/sales";
import { SaleStatusBadge } from "@/components/sales/sales-shared";
import { TripWorkflowBanner } from "@/components/fulfillment/trip-workflow-banner";
import { formatTripProfitMargin, tripStatusLabel } from "@/lib/trip-status";
import { TripDispatchStatusBadge } from "@/components/fulfillment/trip-dispatch-status-badge";
import { FulfillmentGuidanceStrip } from "@/components/fulfillment/fulfillment-guidance-strip";
import {
  FULFILLMENT_WORKFLOW_SCREENS,
  isFulfillmentGuidanceEnabled,
  resolveTripDetailGuidance,
} from "@/lib/fulfillment-guidance";
import { mergeDistributionSettings } from "@/lib/distribution-settings";

function PrintIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v8H6z" />
    </svg>
  );
}

export default function TripDetailPage() {
  const { id } = useParams();
  const { organization, generalSettings, capabilities, user } = useAuth();
  const distributionSettings = useMemo(() => mergeDistributionSettings(capabilities), [capabilities]);
  const guidanceEnabled = isFulfillmentGuidanceEnabled(capabilities);

  const [trip, setTrip] = useState(null);
  const [loadingList, setLoadingList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preparedBy, setPreparedBy] = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  const [collectedCash, setCollectedCash] = useState("");

  const loadTrip = useCallback(async () => {
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
      notifyError(e instanceof ApiError ? e.message : "Failed to load trip");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  const guidance = useMemo(
    () =>
      trip
        ? resolveTripDetailGuidance({ trip, loadingList, distributionSettings })
        : { steps: [], nextStep: null },
    [trip, loadingList, distributionSettings],
  );
  const quickLinks = useMemo(() => {
    if (!trip) return [];
    const links = FULFILLMENT_WORKFLOW_SCREENS.filter((screen) =>
      ["orders", "dispatch", "trips"].includes(screen.id),
    );
    if (trip.status !== "draft" && (trip.sales?.length ?? 0) > 0) {
      return links.filter((screen) => screen.id !== "dispatch");
    }
    return links;
  }, [trip]);

  async function runAction(path, body) {
    setBusy(true);
    try {
      await apiRequest(path, { method: "POST", body });
      notifySuccess("Trip updated.");
      await loadTrip();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Action failed");
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
  async function printStopDeliveryNote(sale, stopNumber) {
    setBusy(true);
    try {
      const fullSale = await apiRequest(`/sales/${sale.id}`);
      printDeliveryNote({
        organization,
        organizationName: organization?.organization_name ?? organization?.company_name ?? "",
        sale: fullSale,
        trip,
        stopNumber,
        printedBy: user?.full_name ?? user?.username ?? null,
        generalSettings: generalSettings(),
        documentFooterText: resolvePrintFooter(
          mergeGeneralSettings(capabilities?.module_settings),
          "loading_sheet",
        ),
      });
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not load order for delivery note");
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
      notifySuccess("Stop order updated.");
      await loadTrip();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not reorder stops");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CatalogPageShell
      title={
        <span className="inline-flex flex-wrap items-center gap-2">
          <span>{trip.trip_code}</span>
          <TripDispatchStatusBadge status={trip.status} />
        </span>
      }
      subtitle={`${formatTripRoutesLabel(trip)} · ${trip.scheduled_date}`}
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

      <div className="mb-4 flex flex-wrap gap-2">
        {quickLinks.map((link) => (
          <Link
            key={link.id}
            href={link.path}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-[#185FA5] hover:text-[#185FA5]"
          >
            {link.step}. {link.screen}
          </Link>
        ))}
      </div>

      {guidanceEnabled ? (
        <FulfillmentGuidanceStrip steps={guidance.steps} nextStep={guidance.nextStep} />
      ) : (
        <TripWorkflowBanner status={trip.status} />
      )}

      <div className="mb-6 grid gap-4 theme-panel rounded-xl border p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        <div>
          <p className="text-xs uppercase text-slate-500">Status</p>
          <p className="mt-1 font-medium text-slate-900">{tripStatusLabel(trip.status)}</p>
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
          <p className="mt-1 font-medium text-slate-900">
            {trip.financial_summary?.order_count ?? trip.sales?.length ?? 0}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Total amount</p>
          <p className="mt-1 font-medium text-slate-900">
            {formatSaleKes(trip.financial_summary?.total_amount ?? 0)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Total profit</p>
          <p className="mt-1 font-medium text-slate-900">
            {formatSaleKes(trip.financial_summary?.total_profit ?? 0)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Profit margin</p>
          <p className="mt-1 font-medium text-slate-900">
            {formatTripProfitMargin(trip.financial_summary?.profit_margin_percent)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Expected COD</p>
          <p className="mt-1 font-medium text-slate-900">
            {trip.expected_cash != null && Number(trip.expected_cash) > 0
              ? formatSaleKes(trip.expected_cash)
              : "—"}
          </p>
        </div>
      </div>

      <section className="mb-8 theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Trip actions</h2>
        <p className="mt-1 text-sm text-slate-600">
          Follow this order: lock the loading list when ready, dispatch when the vehicle leaves, then close the run.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {canLock ? (
            <div id="trip-lock-loading" className="flex w-full flex-wrap items-end gap-3 border-b border-slate-100 pb-4">
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
                1. Lock loading list
              </PrimaryButton>
            </div>
          ) : null}

          {canStart ? (
            <div id="trip-dispatch">
              <PrimaryButton
                type="button"
                showIcon={false}
                disabled={busy || (lines.length > 0 && !loadingLocked)}
                title={lines.length > 0 && !loadingLocked ? "Lock the loading list first" : undefined}
                onClick={() => runAction(`/dispatch-trips/${id}/start`)}
              >
                2. Dispatch trip
              </PrimaryButton>
            </div>
          ) : null}

          {canComplete ? (
            <Link
              href={`/fulfillment/trips/${id}/close`}
              className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
            >
              3. Close trip…
            </Link>
          ) : null}

          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const listRes = await apiRequest(`/dispatch-trips/${id}/loading-list`);
                const freshList = listRes.loading_list ?? listRes;
                setLoadingList(freshList);
                printLoadingList({
                  organization,
                  generalSettings: generalSettings(),
                  organizationName: organization?.organization_name ?? organization?.company_name ?? "Loading List",
                  loadingList: freshList,
                  trip,
                  printSettings: resolveLoadingSheetPrintSettings(capabilities?.module_settings?.distribution),
                  documentFooterText: resolvePrintFooter(
                    mergeGeneralSettings(capabilities?.module_settings),
                    "loading_sheet",
                  ),
                  printedBy: user?.full_name ?? user?.username ?? null,
                });
              } catch (e) {
                notifyError(e instanceof ApiError ? e.message : "Could not refresh loading list for print");
              } finally {
                setBusy(false);
              }
            }}
          >
            Print loading list
          </PrimaryButton>

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
      </section>

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
                    {formatOrderNumber(row)}
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
                    className="theme-primary-btn inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium disabled:opacity-50"
                    disabled={busy}
                    onClick={() => printStopDeliveryNote({ id: row.id }, row.stop)}
                  >
                    <PrintIcon />
                    Print Delivery Note
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
