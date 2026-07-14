"use client";

import Link from "next/link";
import { OrgSettingsPlatformHint } from "@/components/admin/org-settings-platform-hint";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { useAuth } from "@/contexts/auth-context";
import { fetchFulfillmentRefsCached } from "@/lib/reference-data-cache";
import { CatalogPageShell, Field, PaginationBar, PrimaryLink, inputClassName, PrimaryButton } from "@/components/catalog/catalog-shared";
import { CreateDispatchTripDialog } from "@/components/fulfillment/create-dispatch-trip-dialog";
import { DashboardSection, DashboardSummaryTable } from "@/components/dashboard/dashboard-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import {
  FulfillmentAssignmentDialog,
  PodCaptureDialog,
} from "@/components/fulfillment/fulfillment-assignment-dialog";
import { ProductWeightPromptDialog } from "@/components/fulfillment/product-weight-prompt-dialog";
import { getSaleDriverId, getSaleVehicleId } from "@/components/fulfillment/fulfillment-shared";
import { dispatchReadyStatuses, isDistributionOpsEnabled, mergeDistributionSettings, shouldShowOrderAssignAction, assignActionLabel } from "@/lib/distribution-settings";
import { useFulfillmentTransition } from "@/lib/use-fulfillment-transition";
import { formatOrderNumber, formatSaleKes, saleCustomerLabel } from "@/lib/sales";
import { SaleStatusBadge } from "@/components/sales/sales-shared";

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

const EMPTY_LIST = [];


export function DispatchBoardContent() {
  const router = useRouter();
  const { capabilities, user } = useAuth();
  const distributionEnabled = isDistributionOpsEnabled(capabilities);
  const distributionSettings = useMemo(
    () => mergeDistributionSettings(capabilities),
    [capabilities],
  );

  const [runDate, setRunDate] = useState(() => isoDate());
  const [routeFilter, setRouteFilter] = useState("all");
  const [sales, setSales] = useState([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(25);
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [createTripOpen, setCreateTripOpen] = useState(false);
  const [createTripDefaults, setCreateTripDefaults] = useState({
    routeIds: [],
    saleIds: [],
  });

  useEffect(() => {
    let cancelled = false;
    fetchFulfillmentRefsCached(user?.organization_id)
      .then(({ routes: nextRoutes, drivers: nextDrivers, vehicles: nextVehicles }) => {
        if (cancelled) return;
        setRoutes(nextRoutes ?? []);
        setDrivers(nextDrivers ?? []);
        setVehicles(nextVehicles ?? []);
      })
      .catch(() => {
        /* non-blocking refs */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.organization_id]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const extra = {
        dispatch_orders: 1,
        with_items: 0,
        required_date: runDate,
      };
      const boardStatuses = dispatchReadyStatuses(distributionSettings);
      if (boardStatuses?.length) {
        extra.status_in = boardStatuses.join(",");
      }
      if (routeFilter !== "all") extra.route_id = routeFilter;

      const salesRes = await apiRequest("/sales", {
        searchParams: buildPageParams({ page, perPage: pageSize, extra }),
      });
      const parsed = parsePaginator(salesRes);
      setSales(parsed.items);
      setTotalOrders(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load dispatch data");
    } finally {
      setLoading(false);
    }
  }, [runDate, routeFilter, page, pageSize, distributionSettings]);

  useEffect(() => {
    setPage(1);
  }, [runDate, routeFilter]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  useEffect(() => {
    loadData();
  }, [loadData]);

  const routeById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);
  const driverById = useMemo(() => new Map(drivers.map((d) => [d.id, d])), [drivers]);
  const vehicleById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  const dispatchOrders = sales;

  const groupedByRoute = useMemo(() => {
    const map = new Map();
    for (const order of dispatchOrders) {
      const key = order.route_id ?? "unassigned";
      if (!map.has(key)) {
        map.set(key, {
          routeId: order.route_id,
          routeName:
            order.route_id != null
              ? routeById.get(order.route_id)?.route_name ?? `Route #${order.route_id}`
              : "Unassigned route",
          orders: [],
        });
      }
      map.get(key).orders.push(order);
    }
    return [...map.values()].sort((a, b) => a.routeName.localeCompare(b.routeName));
  }, [dispatchOrders, routeById]);

  const {
    assignDialog,
    podDialog,
    weightDialog,
    setAssignDialog,
    setPodDialog,
    setWeightDialog,
    busy: transitionBusy,
    requestTransition,
    requestAssignment,
    runTransition,
    continueAfterWeights,
  } = useFulfillmentTransition({
    capabilities,
    onSuccess: () => {
      notifySuccess("Order updated.");
      setSelectedIds(new Set());
      loadData();
    },
    onError: notifyError,
  });

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openCreateTripFromSelection() {
    const ids = [...selectedIds];
    const selectedSales = sales.filter((s) => ids.includes(s.id));
    if (!selectedSales.length) return;

    const routeIds = [...new Set(selectedSales.map((s) => s.route_id).filter(Boolean))];
    setCreateTripDefaults({
      routeIds,
      saleIds: ids,
    });
    setCreateTripOpen(true);
  }

  async function assignSelected(driverId, vehicleId) {
    const meta = { driver_id: driverId, vehicle_id: vehicleId };
    const assignStatus = distributionSettings.assignOnStatus || "processed";

    for (const id of [...selectedIds]) {
      const sale = sales.find((s) => s.id === id);
      if (!sale) continue;
      await runTransition(sale, assignStatus, meta);
    }
    setAssignDialog(null);
  }

  if (!distributionEnabled) {
    return (
      <CatalogPageShell title="Dispatch board" subtitle="Route planning and delivery assignment">
        <p className="text-sm text-slate-500">
          Distribution operations are disabled. Enable them in{" "}
          <OrgSettingsPlatformHint area="Organization settings → Distribution" />.
          .
        </p>
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell
      title="Dispatch board"
      subtitle="Plan deliveries by route and assign drivers to orders"
      action={
        <div className="flex gap-2">
          <PrimaryButton type="button" showIcon={false} onClick={() => setCreateTripOpen(true)}>
            New trip
          </PrimaryButton>
          <PrimaryLink href="/fulfillment/trips">Trips</PrimaryLink>
          <PrimaryLink href="/fulfillment/routes">Manage routes</PrimaryLink>
        </div>
      }
    >
      <CreateDispatchTripDialog
        open={createTripOpen}
        onClose={() => {
          setCreateTripOpen(false);
          setCreateTripDefaults({ routeIds: [], saleIds: [] });
          setSelectedIds(new Set());
        }}
        routes={routes}
        drivers={drivers}
        vehicles={vehicles}
        defaultDate={runDate}
        defaultRouteIds={
          createTripDefaults.routeIds.length
            ? createTripDefaults.routeIds
            : routeFilter !== "all"
              ? [Number(routeFilter)]
              : EMPTY_LIST
        }
        defaultSaleIds={createTripDefaults.saleIds}
      />
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <Field label="Delivery date">
          <input
            type="date"
            className={inputClassName()}
            value={runDate}
            onChange={(e) => setRunDate(e.target.value)}
          />
        </Field>
        <Field label="Route">
          <select
            className={inputClassName()}
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
          >
            <option value="all">All routes</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.route_name}
              </option>
            ))}
          </select>
        </Field>
        <button
          type="button"
          className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          onClick={() => loadData()}
        >
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading dispatch board…</p>
      ) : (
        <div className="space-y-8">
          {groupedByRoute.length === 0 ? (
            <p className="text-sm text-slate-500">No orders ready for dispatch on this date.</p>
          ) : (
            groupedByRoute.map((group) => (
              <DashboardSection
                key={group.routeId ?? "unassigned"}
                title={group.routeName}
                subtitle={`${group.orders.length} order(s) ready`}
              >
                <DashboardSummaryTable
                  columns={[
                    {
                      key: "select",
                      label: "",
                      render: (row) => (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(row.id)}
                          onChange={() => toggleSelect(row.id)}
                        />
                      ),
                    },
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
                    { key: "driver", label: "Driver" },
                    { key: "vehicle", label: "Vehicle" },
                    {
                      key: "actions",
                      label: "",
                      render: (row) => {
                        const order = group.orders.find((o) => o.id === row.id);
                        if (!order || !shouldShowOrderAssignAction(order, distributionSettings)) {
                          return null;
                        }
                        return (
                          <button
                            type="button"
                            className="text-xs font-medium text-[#185FA5] hover:underline"
                            onClick={() => requestAssignment(order)}
                          >
                            {assignActionLabel(order, distributionSettings)}
                          </button>
                        );
                      },
                    },
                  ]}
                  rows={group.orders.map((order) => {
                    const driverId = getSaleDriverId(order);
                    const vehicleId = getSaleVehicleId(order);
                    return {
                      id: order.id,
                      order_num: order.order_num,
                      customer: saleCustomerLabel(order),
                      total: formatSaleKes(order.order_total),
                      status: order.status,
                      driver: driverId ? driverById.get(driverId)?.full_name ?? "—" : "—",
                      vehicle: vehicleId
                        ? vehicleById.get(vehicleId)?.plate_number ?? vehicleById.get(vehicleId)?.vehicle_name ?? "—"
                        : "—",
                    };
                  })}
                />
              </DashboardSection>
            ))
          )}
        </div>
      )}

      {!loading && totalOrders > 0 ? (
        <PaginationBar
          page={page}
          totalPages={totalPages}
          total={totalOrders}
          pageSize={pageSize}
          onChange={setPage}
              onPageSizeChange={handlePageSizeChange}
            />
      ) : null}

      {selectedIds.size > 0 ? (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <span className="text-sm text-slate-600">{selectedIds.size} selected</span>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm hover:bg-slate-50"
            onClick={() => openCreateTripFromSelection()}
          >
            Create trip chart
          </button>
          {[...selectedIds].some((id) => {
            const sale = sales.find((s) => s.id === id);
            return sale && shouldShowOrderAssignAction(sale, distributionSettings);
          }) ? (
            <button
              type="button"
              className="rounded-lg bg-[#185FA5] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#144f8a]"
              onClick={() =>
                setAssignDialog({
                  sale: { id: "bulk" },
                  targetStatus: distributionSettings.assignOnStatus || "processed",
                  bulk: true,
                })
              }
            >
              Assign driver
            </button>
          ) : null}
        </div>
      ) : null}

      <FulfillmentAssignmentDialog
        open={Boolean(assignDialog)}
        sale={assignDialog?.sale}
        targetStatus={assignDialog?.targetStatus}
        drivers={drivers}
        vehicles={vehicles}
        routes={routes}
        busy={transitionBusy}
        onClose={() => setAssignDialog(null)}
        onConfirm={async (meta) => {
          if (assignDialog?.bulk) {
            await assignSelected(meta.driver_id, meta.vehicle_id);
          } else if (assignDialog?.sale) {
            await runTransition(assignDialog.sale, assignDialog.targetStatus, meta);
          }
        }}
      />

      <PodCaptureDialog
        open={Boolean(podDialog)}
        sale={podDialog?.sale}
        busy={transitionBusy}
        onClose={() => setPodDialog(null)}
        onConfirm={(meta) => {
          if (podDialog?.sale) {
            void runTransition(podDialog.sale, podDialog.targetStatus, meta);
          }
        }}
      />

      <ProductWeightPromptDialog
        open={Boolean(weightDialog)}
        sale={weightDialog?.sale}
        targetStatus={weightDialog?.targetStatus}
        products={weightDialog?.products ?? []}
        busy={transitionBusy}
        onClose={() => setWeightDialog(null)}
        onSaved={async () => {
          const { sale, targetStatus, fulfillmentMeta } = weightDialog ?? {};
          if (sale) await continueAfterWeights(sale, targetStatus, fulfillmentMeta);
        }}
      />
    </CatalogPageShell>
  );
}
