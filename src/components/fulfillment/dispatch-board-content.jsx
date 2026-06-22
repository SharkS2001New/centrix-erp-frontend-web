"use client";

import Link from "next/link";
import { OrgSettingsPlatformHint } from "@/components/admin/org-settings-platform-hint";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useAuth } from "@/contexts/auth-context";
import { CatalogPageShell, Field, PaginationBar, PrimaryLink, inputClassName } from "@/components/catalog/catalog-shared";
import { DashboardErrorBanner, DashboardSection, DashboardSummaryTable } from "@/components/dashboard/dashboard-shared";
import {
  FulfillmentAssignmentDialog,
  PodCaptureDialog,
} from "@/components/fulfillment/fulfillment-assignment-dialog";
import { getSaleDriverId, getSaleVehicleId } from "@/components/fulfillment/fulfillment-shared";
import { DISPATCH_READY_STATUSES, isDistributionOpsEnabled, mergeDistributionSettings, shouldShowOrderAssignAction, assignActionLabel } from "@/lib/distribution-settings";
import { useFulfillmentTransition } from "@/lib/use-fulfillment-transition";
import { formatSaleKes, saleCustomerLabel } from "@/lib/sales";
import { SaleStatusBadge } from "@/components/sales/sales-shared";

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

const DISPATCH_PAGE_SIZE = 25;

export function DispatchBoardContent() {
  const router = useRouter();
  const { capabilities } = useAuth();
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
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [creatingTrip, setCreatingTrip] = useState(false);

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const extra = {
        dispatch_orders: 1,
        with_items: 0,
        required_date: runDate,
        status_in: DISPATCH_READY_STATUSES.join(","),
        exclude_statuses: "cancelled,completed,held,draft",
      };
      if (routeFilter !== "all") extra.route_id = routeFilter;

      const [salesRes, routeRes, driverRes, vehicleRes] = await Promise.all([
        apiRequest("/sales", {
          searchParams: buildPageParams({ page, perPage: DISPATCH_PAGE_SIZE, extra }),
        }),
        apiRequest("/routes", { searchParams: { per_page: 200 } }),
        apiRequest("/drivers", { searchParams: { per_page: 200 } }),
        apiRequest("/vehicles", { searchParams: { per_page: 200 } }),
      ]);
      const parsed = parsePaginator(salesRes);
      setSales(parsed.items);
      setTotalOrders(parsed.total);
      setTotalPages(parsed.totalPages);
      setRoutes(routeRes.data ?? []);
      setDrivers(driverRes.data ?? []);
      setVehicles(vehicleRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dispatch data");
    } finally {
      setLoading(false);
    }
  }, [runDate, routeFilter, page]);

  useEffect(() => {
    setPage(1);
  }, [runDate, routeFilter]);

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
    setAssignDialog,
    setPodDialog,
    busy: transitionBusy,
    requestTransition,
    requestAssignment,
    runTransition,
  } = useFulfillmentTransition({
    capabilities,
    onSuccess: () => {
      setMessage("Order updated.");
      setSelectedIds(new Set());
      loadData();
    },
    onError: setError,
  });

  function toggleSelect(id) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createTripFromSelection() {
    const ids = [...selectedIds];
    const selectedSales = sales.filter((s) => ids.includes(s.id));
    if (!selectedSales.length) return;

    const routeIds = [...new Set(selectedSales.map((s) => s.route_id).filter(Boolean))];
    if (routeIds.length > 1) {
      setError("Selected orders must belong to the same route.");
      return;
    }

    setCreatingTrip(true);
    setError(null);
    try {
      const trip = await apiRequest("/dispatch-trips", {
        method: "POST",
        body: {
          scheduled_date: runDate,
          route_id: routeIds[0] ?? null,
          sale_ids: ids,
        },
      });
      setSelectedIds(new Set());
      router.push(`/fulfillment/trips/${trip.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create trip");
    } finally {
      setCreatingTrip(false);
    }
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
          <PrimaryLink href="/fulfillment/trips">Trips</PrimaryLink>
          <PrimaryLink href="/fulfillment/routes">Manage routes</PrimaryLink>
        </div>
      }
    >
      <DashboardErrorBanner message={error} />
      {message ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}

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
                          {row.order_num ?? row.id}
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
          pageSize={DISPATCH_PAGE_SIZE}
          onChange={setPage}
        />
      ) : null}

      {selectedIds.size > 0 ? (
        <div className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-slate-200 bg-white px-5 py-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <span className="text-sm text-slate-600">{selectedIds.size} selected</span>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-1.5 text-sm hover:bg-slate-50"
            disabled={creatingTrip}
            onClick={() => void createTripFromSelection()}
          >
            {creatingTrip ? "Creating…" : "Create trip"}
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
    </CatalogPageShell>
  );
}
