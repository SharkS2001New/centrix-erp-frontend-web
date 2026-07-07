"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useConfirm } from "@/lib/use-confirm";
import { P } from "@/lib/permission-codes";
import { AppBreadcrumb } from "@/components/layout/app-breadcrumb";
import {
  CatalogPageShell,
  Field,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { DashboardSummaryTable } from "@/components/dashboard/dashboard-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { TripExpensesPanel } from "@/components/fulfillment/trip-expenses-panel";
import { printLoadingList } from "@/components/fulfillment/loading-list-print";
import { printPickingList } from "@/components/fulfillment/picking-list-print";
import { formatTripRoutesLabel } from "@/lib/trip-routes";
import { printDeliveryNote } from "@/components/fulfillment/delivery-note-print";
import { resolvePrintFooter } from "@/lib/print-footer-settings";
import { mergeGeneralSettings } from "@/lib/general-settings";
import { isDistributionOpsEnabled, isProductShelfLocationEnabled } from "@/lib/distribution-settings";
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
import { formatCollectedCashDefault, resolveTripExpectedCash } from "@/lib/trip-cod";
import { resolveLoadingSheetPrintSettings } from "@/lib/loading-sheet-print-settings";
import {
  buildUomByProductCode,
  fetchCatalogForProductCodes,
  formatFulfillmentQty,
  fulfillmentLoadingListLabels,
  fulfillmentPackageUnitPrice,
  fulfillmentPickedBaseQty,
  fulfillmentPickedDisplayQty,
  fulfillmentPickedInputUnit,
} from "@/lib/fulfillment-quantity";

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
  const router = useRouter();
  const confirm = useConfirm();
  const { organization, generalSettings, capabilities, user, hasPermission } = useAuth();
  const distributionSettings = useMemo(() => mergeDistributionSettings(capabilities), [capabilities]);
  const guidanceEnabled = isFulfillmentGuidanceEnabled(capabilities);
  const includeShelfLocation = isProductShelfLocationEnabled(capabilities);

  const [trip, setTrip] = useState(null);
  const [loadingList, setLoadingList] = useState(null);
  const [pickingList, setPickingList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preparedBy, setPreparedBy] = useState("");
  const [checkedBy, setCheckedBy] = useState("");
  const [pickerName, setPickerName] = useState("");
  const [pickedDraft, setPickedDraft] = useState({});
  const [collectedCash, setCollectedCash] = useState("");
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [uoms, setUoms] = useState([]);

  const uomByProductCode = useMemo(
    () => buildUomByProductCode(catalogProducts, uoms),
    [catalogProducts, uoms],
  );

  const loadTrip = useCallback(async () => {
    setLoading(true);
    try {
      const [tripRes, listRes, pickRes] = await Promise.all([
        apiRequest(`/dispatch-trips/${id}`),
        apiRequest(`/dispatch-trips/${id}/loading-list`),
        apiRequest(`/dispatch-trips/${id}/picking-list`),
      ]);
      const nextPicking = pickRes.picking_list ?? pickRes;
      const nextLoading = listRes.loading_list ?? listRes;
      const productCodes = [
        ...(nextPicking?.lines ?? []).map((line) => line.product_code),
        ...(nextLoading?.lines ?? []).map((line) => line.product_code),
      ];
      const { products, uoms: uomRows } = await fetchCatalogForProductCodes(apiRequest, productCodes);
      const uomMap = buildUomByProductCode(products, uomRows);

      setTrip(tripRes);
      setLoadingList(nextLoading);
      setCatalogProducts(products);
      setUoms(uomRows);
      setPickingList(nextPicking);
      setPickedDraft(
        Object.fromEntries(
          (nextPicking?.lines ?? []).map((line) => [
            line.id,
            String(
              fulfillmentPickedDisplayQty(line.picked_qty ?? line.required_qty, line, uomMap),
            ),
          ]),
        ),
      );
      setPreparedBy(listRes.loading_list?.prepared_by_name ?? tripRes.prepared_by_name ?? "");
      setCheckedBy(listRes.loading_list?.checked_by_name ?? tripRes.checked_by_name ?? "");
      setPickerName(nextPicking?.picker_name ?? user?.full_name ?? user?.username ?? "");
      const expectedCash = resolveTripExpectedCash(tripRes);
      setCollectedCash(
        formatCollectedCashDefault(expectedCash, tripRes.collected_cash),
      );
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load trip");
    } finally {
      setLoading(false);
    }
  }, [id, user?.full_name, user?.username]);

  useEffect(() => {
    loadTrip();
  }, [loadTrip]);

  const pickingEditable = pickingList?.status === "open" || pickingList?.status === "completed";
  const pickingTableColumns = useMemo(
    () => [
      { key: "line_no", label: "No." },
      ...(includeShelfLocation
        ? [{ key: "shelf_location", label: "Shelf", render: (row) => row.shelf_location || "—" }]
        : []),
      { key: "product_name", label: "Product" },
      {
        key: "quantity_label",
        label: "Requested",
        render: (row) => formatFulfillmentQty(row.required_qty, row, uomByProductCode),
      },
      {
        key: "picked_qty",
        label: "Picked",
        align: "right",
        render: (row) => {
          const pickedBase = fulfillmentPickedBaseQty(
            pickedDraft[row.id] ?? row.picked_qty ?? row.required_qty,
            row,
            uomByProductCode,
          );
          if (pickingEditable) {
            return (
              <div className="flex flex-col items-end gap-1">
                <input
                  type="number"
                  min="0"
                  step="any"
                  title={`Quantity in ${fulfillmentPickedInputUnit(row, uomByProductCode)}`}
                  className={`${inputClassName()} w-24 text-right`}
                  value={
                    pickedDraft[row.id] ??
                    String(fulfillmentPickedDisplayQty(row.picked_qty ?? row.required_qty, row, uomByProductCode))
                  }
                  onChange={(e) =>
                    setPickedDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
                  }
                />
                <span className="text-[11px] text-slate-500">
                  {formatFulfillmentQty(pickedBase, row, uomByProductCode)}
                </span>
              </div>
            );
          }
          return formatFulfillmentQty(row.picked_qty ?? row.required_qty, row, uomByProductCode);
        },
      },
      {
        key: "shortage_qty",
        label: "Shortage",
        align: "right",
        render: (row) => {
          const required = Number(row.required_qty) || 0;
          const picked = fulfillmentPickedBaseQty(
            pickingEditable ? pickedDraft[row.id] ?? row.picked_qty : row.picked_qty,
            row,
            uomByProductCode,
          );
          const shortage = Math.max(0, required - picked);
          return shortage > 0 ? (
            <span className="font-medium text-amber-700">
              {formatFulfillmentQty(shortage, row, uomByProductCode)}
            </span>
          ) : (
            "—"
          );
        },
      },
      {
        key: "stock_location",
        label: "From",
        render: (row) => (row.stock_location === "shop" ? "Shop" : "Store"),
      },
    ],
    [includeShelfLocation, pickedDraft, pickingEditable, uomByProductCode],
  );

  const guidance = useMemo(
    () =>
      trip
        ? resolveTripDetailGuidance({ trip, loadingList, pickingList, distributionSettings })
        : { steps: [], nextStep: null },
    [trip, loadingList, pickingList, distributionSettings],
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

  async function runAction(path, body, { method = "POST" } = {}) {
    setBusy(true);
    try {
      await apiRequest(path, { method, body });
      notifySuccess("Trip updated.");
      await loadTrip();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  const canDeleteTrip =
    Boolean(user?.is_admin) ||
    hasPermission(P.fulfillment.trips.delete) ||
    hasPermission("fulfillment.manage");

  async function deleteTripChart() {
    if (!trip || !canDeleteTrip) return;

    if (trip.status === "completed") {
      notifyError("Completed trip charts cannot be deleted.");
      return;
    }

    const needsCancel = !["draft", "cancelled"].includes(trip.status);
    const ok = await confirm({
      title: needsCancel ? "Cancel and delete trip chart" : "Delete trip chart",
      message: needsCancel
        ? "This trip must be cancelled before it can be removed. Cancel it now and delete permanently?"
        : `Permanently delete trip chart ${trip.trip_code ?? id}? This cannot be undone.`,
      confirmLabel: needsCancel ? "Cancel & delete" : "Delete",
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      if (needsCancel) {
        await apiRequest(`/dispatch-trips/${id}/cancel`, { method: "POST" });
      }
      await apiRequest(`/dispatch-trips/${id}`, { method: "DELETE" });
      notifySuccess("Trip chart deleted.");
      router.push("/fulfillment/trips");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not delete trip chart");
    } finally {
      setBusy(false);
    }
  }

  async function savePickedQuantities() {
    const lines = (pickingList?.lines ?? [])
      .map((line) => ({
        id: line.id,
        picked_qty:
          fulfillmentPickedBaseQty(
            pickedDraft[line.id] ?? line.picked_qty ?? line.required_qty,
            line,
            uomByProductCode,
          ) || 0,
      }))
      .filter((line) => line.id);
    if (!lines.length) return;

    setBusy(true);
    try {
      const res = await apiRequest(`/dispatch-trips/${id}/picking-list/lines`, {
        method: "PATCH",
        body: { lines },
      });
      const updated = res.picking_list ?? res;
      setPickingList(updated);
      setPickedDraft(
        Object.fromEntries(
          (updated?.lines ?? []).map((line) => [
            line.id,
            String(fulfillmentPickedDisplayQty(line.picked_qty, line, uomByProductCode)),
          ]),
        ),
      );
      notifySuccess("Picked quantities saved.");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not save picked quantities");
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
  const pickLines = pickingList?.lines ?? [];
  const loadingLocked = loadingList?.status && loadingList.status !== "open";
  const pickingComplete =
    pickingList?.status === "completed" || pickingList?.status === "locked" || loadingLocked;
  const requirePickingBeforeLock = Boolean(distributionSettings.requirePickingBeforeLock);
  const pickingLocked = pickingList?.status === "locked";
  const canLock =
    trip.status === "draft" &&
    lines.length > 0 &&
    !loadingLocked &&
    (!requirePickingBeforeLock || pickingComplete);
  const canStart =
    ["draft", "loading"].includes(trip.status) &&
    (trip.sales?.length ?? 0) > 0 &&
    (lines.length === 0 || loadingLocked);
  const canComplete = trip.status === "in_transit";
  const showCloseReconciliation = ["in_transit", "completed"].includes(trip.status);
  const canReorder = !["completed", "cancelled"].includes(trip.status);
  const canRemoveOrders =
    trip.status === "draft" &&
    !loadingLocked &&
    !["completed", "locked"].includes(String(pickingList?.status ?? ""));
  const codEnabled = Boolean(distributionSettings.enableCodReconciliation);
  const expectedCash = resolveTripExpectedCash(trip);
  const showCashSettlement =
    codEnabled &&
    ["in_transit", "completed"].includes(trip.status) &&
    (expectedCash > 0 || !trip.settled_at);
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
  const pendingDeliveryCount = orderedSales.filter(
    (sale) => String(sale.status).toLowerCase() === "processed",
  ).length;
  const canConfirmDeliveries =
    trip.status === "in_transit" &&
    pendingDeliveryCount > 0 &&
    !distributionSettings.requirePodOnDelivered;

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

  async function removeStop(sale) {
    if (!sale?.id) return;
    const ok = await confirm({
      title: "Remove order from trip chart",
      message: `Remove order ${formatOrderNumber(sale)} from trip ${trip.trip_code}? You can add it back later from the dispatch board if needed.`,
      confirmLabel: "Remove order",
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    try {
      await apiRequest(`/dispatch-trips/${id}/orders/${sale.id}`, {
        method: "DELETE",
      });
      notifySuccess("Order removed from trip chart.");
      await loadTrip();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Could not remove order from trip chart");
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
      <AppBreadcrumb
        items={[
          { label: "Distribution", href: "/fulfillment" },
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

      <div className="mb-6 grid gap-4 theme-panel rounded-xl border p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9">
        <div>
          <p className="text-xs uppercase text-slate-500">Status</p>
          <p className="mt-1 font-medium text-slate-900">{tripStatusLabel(trip.status)}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Driver</p>
          <p className="mt-1 font-medium text-slate-900">{trip.driver?.full_name ?? "—"}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Turn boys</p>
          <p className="mt-1 font-medium text-slate-900">
            {trip.turn_boys?.length
              ? trip.turn_boys.map((employee) => employee.full_name).join(", ")
              : "—"}
          </p>
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
          <p className="text-xs uppercase text-slate-500">Planned amount</p>
          <p className="mt-1 font-medium text-slate-900">
            {formatSaleKes(trip.financial_summary?.total_amount ?? 0)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Actual accepted</p>
          <p className="mt-1 font-medium text-slate-900">
            {formatSaleKes(trip.financial_summary?.actual_amount ?? trip.financial_summary?.total_amount ?? 0)}
          </p>
          <p className="text-xs text-slate-500">
            Returns {formatSaleKes(trip.financial_summary?.returned_amount ?? 0)} · Failed{" "}
            {formatSaleKes(trip.financial_summary?.failed_amount ?? 0)}
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
          <p className="text-xs uppercase text-slate-500">Net profit</p>
          <p className="mt-1 font-medium text-slate-900">
            {formatSaleKes(trip.financial_summary?.net_profit ?? trip.financial_summary?.total_profit ?? 0)}
          </p>
          <p className="text-xs text-slate-500">
            After expenses · {formatTripProfitMargin(trip.financial_summary?.net_profit_margin_percent)}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase text-slate-500">Expected COD</p>
          <p className="mt-1 font-medium text-slate-900">
            {codEnabled && expectedCash > 0
              ? formatSaleKes(expectedCash)
              : codEnabled && (trip.sales?.length ?? 0) > 0
                ? formatSaleKes(0)
                : "—"}
          </p>
        </div>
      </div>

      <section className="mb-8 theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Trip actions</h2>
        <p className="mt-1 text-sm text-slate-600">
          Warehouse flow: print the picking list, confirm picked quantities, then lock the loading list and dispatch.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          {canLock || (trip.status === "draft" && lines.length > 0 && !loadingLocked) ? (
            <div id="trip-lock-loading" className="flex w-full flex-wrap items-end gap-3 border-b border-slate-100 pb-4">
              {requirePickingBeforeLock && !pickingComplete && pickLines.length > 0 ? (
                <p className="w-full rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Complete warehouse picking before locking the loading list.{" "}
                  <Link href={`/fulfillment/picking?trip_id=${id}`} className="font-medium underline">
                    Open warehouse picking
                  </Link>
                </p>
              ) : null}
              <Field label="Prepared by">
                <input className={inputClassName()} value={preparedBy} onChange={(e) => setPreparedBy(e.target.value)} />
              </Field>
              <Field label="Checked by">
                <input className={inputClassName()} value={checkedBy} onChange={(e) => setCheckedBy(e.target.value)} />
              </Field>
              {canLock ? (
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
              ) : null}
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

            <Link
              href={`/fulfillment/picking?trip_id=${id}`}
              className="theme-secondary-btn inline-flex rounded-lg px-4 py-2 text-sm font-medium shadow-sm"
            >
              Warehouse picking (mobile)
            </Link>

            <PrimaryButton
            type="button"
            showIcon={false}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const pickRes = await apiRequest(`/dispatch-trips/${id}/picking-list`);
                const freshPick = pickRes.picking_list ?? pickRes;
                setPickingList(freshPick);
                printPickingList({
                  organization,
                  generalSettings: generalSettings(),
                  organizationName: organization?.organization_name ?? organization?.company_name ?? "Picking List",
                  pickingList: freshPick,
                  trip,
                  uomByProductCode,
                  documentFooterText: resolvePrintFooter(
                    mergeGeneralSettings(capabilities?.module_settings),
                    "loading_sheet",
                  ),
                  printedBy: user?.full_name ?? user?.username ?? null,
                  includeShelfLocation,
                });
              } catch (e) {
                notifyError(e instanceof ApiError ? e.message : "Could not refresh picking list for print");
              } finally {
                setBusy(false);
              }
            }}
          >
            Print picking list
          </PrimaryButton>

          <PrimaryButton
            type="button"
            showIcon={false}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const listRes = await apiRequest(`/dispatch-trips/${id}/loading-list`);
                const freshList = listRes.loading_list ?? listRes;
                const freshSummary = listRes.financial_summary ?? trip.financial_summary;
                setLoadingList(freshList);
                printLoadingList({
                  organization,
                  generalSettings: generalSettings(),
                  organizationName: organization?.organization_name ?? organization?.company_name ?? "Loading List",
                  loadingList: freshList,
                  trip,
                  financialSummary: freshSummary,
                  printSettings: resolveLoadingSheetPrintSettings(capabilities?.module_settings?.distribution),
                  documentFooterText: resolvePrintFooter(
                    mergeGeneralSettings(capabilities?.module_settings),
                    "loading_sheet",
                  ),
                  printedBy: user?.full_name ?? user?.username ?? null,
                  distributionEnabled: isDistributionOpsEnabled(capabilities),
                  uomByProductCode,
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
          {canDeleteTrip && trip.status !== "completed" ? (
            <button
              type="button"
              className="rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-800 hover:bg-red-100"
              disabled={busy}
              onClick={() => void deleteTripChart()}
            >
              Delete trip chart
            </button>
          ) : null}
        </div>
      </section>

      {showCashSettlement ? (
        <section className="mb-8 theme-panel rounded-xl border p-5 shadow-sm">
          <h2 className="text-lg font-medium text-slate-900">Cash settlement</h2>
          <p className="mt-1 text-sm text-slate-500">
            Expected COD is calculated from unpaid balances on orders assigned to this trip.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <dt className="text-slate-500">Expected cash</dt>
              <dd className="font-medium text-slate-900">{formatSaleKes(expectedCash)}</dd>
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

      <div className="mb-8">
        <TripExpensesPanel
          tripId={Number(id)}
          tripDate={trip.scheduled_date}
          financialSummary={trip.financial_summary}
          onChanged={loadTrip}
          readOnly={trip.status === "cancelled"}
        />
      </div>

      <section id="trip-picking-list" className="mb-8 theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Picking list</h2>
        <p className="mt-1 text-sm text-slate-500">
          Warehouse pick sheet sorted by shelf location ·{" "}
          {pickingList?.list_number ? (
            <>
              <span className="font-mono font-medium">{pickingList.list_number}</span>
              {" · "}
            </>
          ) : null}
          {pickLines.length} product line{pickLines.length === 1 ? "" : "s"}
          {pickingList?.status ? (
            <>
              {" "}
              · Status <span className="capitalize font-medium">{pickingList.status}</span>
            </>
          ) : null}
        </p>

        {pickingEditable && pickLines.length > 0 ? (
          <div className="mt-4 flex flex-wrap items-end gap-3 border-b border-slate-100 pb-4">
            <Field label="Picker name">
              <input
                className={inputClassName()}
                value={pickerName}
                onChange={(e) => setPickerName(e.target.value)}
              />
            </Field>
            <PrimaryButton
              type="button"
              showIcon={false}
              disabled={busy}
              onClick={savePickedQuantities}
            >
              Save picked quantities
            </PrimaryButton>
            <button
              type="button"
              className="theme-secondary-btn rounded-lg px-4 py-2 text-sm shadow-sm"
              disabled={busy}
              onClick={() =>
                runAction(`/dispatch-trips/${id}/picking-list/complete`, {
                  picker_name: pickerName.trim() || null,
                })
              }
            >
              Mark picking complete
            </button>
          </div>
        ) : null}

        <div className="mt-4">
          <DashboardSummaryTable
            columns={pickingTableColumns}
            rows={pickLines}
          />
        </div>
        {pickingLocked ? (
          <p className="mt-3 text-xs text-slate-500">Picking list locked with the loading list.</p>
        ) : null}
      </section>

      <section className="mb-8 theme-panel rounded-xl border p-5 shadow-sm">
        <h2 className="text-lg font-medium text-slate-900">Loading list</h2>
        <p className="mt-1 text-sm text-slate-500">
          Vehicle load manifest from picked goods · Total{" "}
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
            rows={lines.map((line) => {
              const labels = fulfillmentLoadingListLabels(line.quantity, line, uomByProductCode);
              return {
                ...line,
                quantity_label: labels.quantityLabel,
                pack_breakdown: labels.packBreakdown || "—",
                unit_price: formatSaleKes(fulfillmentPackageUnitPrice(line, uomByProductCode)),
                line_total: formatSaleKes(line.line_total),
              };
            })}
          />
        </div>
      </section>

      <section className="theme-panel rounded-xl border p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-slate-900">Delivery stops</h2>
            <p className="mt-1 text-sm text-slate-500">Sequence orders for the driver route run.</p>
          </div>
          {canConfirmDeliveries ? (
            <PrimaryButton
              type="button"
              showIcon={false}
              disabled={busy}
              onClick={() => runAction(`/dispatch-trips/${id}/confirm-deliveries`)}
            >
              Confirm all delivered ({pendingDeliveryCount})
            </PrimaryButton>
          ) : null}
        </div>
        {trip.status === "in_transit" && pendingDeliveryCount > 0 && distributionSettings.requirePodOnDelivered ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Proof of delivery is required for each stop. Capture POD from the driver app before confirming deliveries.
          </p>
        ) : null}
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
              ...(canRemoveOrders
                ? [
                    {
                      key: "remove",
                      label: "",
                      render: (row) => (
                        <button
                          type="button"
                          className="rounded border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-40"
                          disabled={busy}
                          onClick={() => removeStop(row.sale)}
                        >
                          Remove
                        </button>
                      ),
                    },
                  ]
                : []),
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
              sale,
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
