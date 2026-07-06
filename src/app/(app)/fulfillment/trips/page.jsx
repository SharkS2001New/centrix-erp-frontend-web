"use client";

import Link from "next/link";
import { OrgSettingsPlatformHint } from "@/components/admin/org-settings-platform-hint";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { isDistributionOpsEnabled } from "@/lib/distribution-settings";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  PrimaryButton,
  PrimaryLink,
  SearchInput,
  StatCard,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { DISPATCH_TRIP_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-shared";
import { CreateDispatchTripDialog } from "@/components/fulfillment/create-dispatch-trip-dialog";
import { MergeDispatchTripsDialog } from "@/components/fulfillment/merge-dispatch-trips-dialog";
import { formatTripRoutesLabel } from "@/lib/trip-routes";
import { formatTripProfitMargin, tripStatusLabel } from "@/lib/trip-status";
import { formatSaleKes } from "@/lib/sales";
import { TripDispatchStatusBadge } from "@/components/fulfillment/trip-dispatch-status-badge";
import {
  BatchActionBar,
  TableRowSelectCell,
  TableSelectAllHeader,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";
const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "loading", label: "Loading" },
  { value: "in_transit", label: "In transit" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function statusLabel(status) {
  return tripStatusLabel(status);
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return isoDate(d);
}

/** Inclusive range: today plus the previous two calendar days. */
function defaultTripsDateRange() {
  return { from: daysAgoIso(2), to: isoDate() };
}

function formatTripCash(trip) {
  const expected = Number(trip.expected_cash ?? 0);
  if (trip.cash_variance != null && trip.settled_at) {
    const variance = Number(trip.cash_variance);
    if (Math.abs(variance) < 0.01) return "Balanced";
    return variance < 0 ? "Short" : "Over";
  }
  return expected > 0 ? "Due" : "—";
}

export default function TripsPage() {
  const { capabilities } = useAuth();
  const distributionEnabled = isDistributionOpsEnabled(capabilities);

  const [trips, setTrips] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fromDate, setFromDate] = useState(() => defaultTripsDateRange().from);
  const [toDate, setToDate] = useState(() => defaultTripsDateRange().to);
  const [createTripOpen, setCreateTripOpen] = useState(false);
  const [mergeTripOpen, setMergeTripOpen] = useState(false);
  const {
    selectedIds,
    selectedCount,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [tripRes, routeRes] = await Promise.all([
        apiRequest("/dispatch-trips", {
          searchParams: {
            per_page: 200,
            from_date: fromDate,
            to_date: toDate,
            ...(statusFilter !== "all" ? { "filter[status]": statusFilter } : {}),
          },
        }),
        apiRequest("/routes", { searchParams: { per_page: 200 } }),
      ]);
      setTrips(tripRes.data ?? []);
      setRoutes(routeRes.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load trips");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const routeById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter((t) => {
      const routeName = formatTripRoutesLabel(t, routeById);
      return (
        String(t.trip_code).toLowerCase().includes(q) ||
        routeName.toLowerCase().includes(q) ||
        String(t.driver?.full_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [trips, routeById, search]);

  const selectedTrips = useMemo(
    () => filtered.filter((trip) => selectedIds.has(String(trip.id))),
    [filtered, selectedIds],
  );
  const mergeableTrips = selectedTrips.filter((trip) => trip.status === "draft");
  const pageRowIds = useMemo(() => filtered.map((trip) => trip.id), [filtered]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);

  const stats = useMemo(() => {
    const active = trips.filter((t) => ["draft", "loading", "in_transit"].includes(t.status));
    return {
      total: trips.length,
      active: active.length,
      completed: trips.filter((t) => t.status === "completed").length,
    };
  }, [trips]);

  if (!distributionEnabled) {
    return (
      <CatalogPageShell title="Dispatch trips" subtitle="Route runs and loading lists">
        <p className="text-sm text-slate-500">
          Enable distribution operations in <OrgSettingsPlatformHint area="Organization settings → Distribution" />.
          .
        </p>
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell
      title="Dispatch trips"
      subtitle="Plan route runs, build loading lists, and track deliveries"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Dispatch trips"
            filename="dispatch-trips"
            apiPath="/dispatch-trips"
            columns={DISPATCH_TRIP_EXPORT_COLUMNS}
            totalCount={filtered.length}
            getSearchParams={() => ({
              per_page: 200,
              from_date: fromDate,
              to_date: toDate,
              ...(statusFilter !== "all" ? { "filter[status]": statusFilter } : {}),
            })}
            disabled={loading}
          />
          <PrimaryLink href="/fulfillment/dispatch">Dispatch board</PrimaryLink>
          <PrimaryButton type="button" showIcon={false} onClick={() => setCreateTripOpen(true)}>
            New trip
          </PrimaryButton>
        </div>
      }
    >
      <CreateDispatchTripDialog
        open={createTripOpen}
        onClose={() => setCreateTripOpen(false)}
        routes={routes}
        defaultDate={toDate}
      />
      <MergeDispatchTripsDialog
        open={mergeTripOpen}
        onClose={() => {
          setMergeTripOpen(false);
          clearSelection();
          loadData();
        }}
        trips={mergeableTrips}
      />
      <DashboardErrorBanner message={error} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Trips in range" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Completed" value={stats.completed} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search trip, route, driver…" />
        <Field label="From date">
          <input type="date" className={inputClassName()} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
        </Field>
        <Field label="To date">
          <input type="date" className={inputClassName()} value={toDate} onChange={(e) => setToDate(e.target.value)} />
        </Field>
        <Field label="Status">
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={STATUS_OPTIONS}
          />
        </Field>
        <PrimaryButton type="button" showIcon={false} onClick={() => loadData()}>
          Refresh
        </PrimaryButton>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading trips…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-slate-500">No trips in this date range. Create one manually or from the dispatch board.</p>
      ) : (
        <div className="theme-panel theme-table-shell overflow-x-auto rounded-xl shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <TableSelectAllHeader
                  checked={allOnPageSelected}
                  indeterminate={someOnPageSelected}
                  onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                />
                <th className="px-4 py-3">Trip</th>
                <th className="px-4 py-3">Routes</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Turn boys</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3 text-right">Planned / actual</th>
                <th className="px-4 py-3 text-right">Profit</th>
                <th className="px-4 py-3 text-right">Net profit</th>
                <th className="px-4 py-3 text-right">Margin</th>
                <th className="px-4 py-3">Cash</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((trip) => (
                <tr key={trip.id} className="border-t border-slate-100">
                  <TableRowSelectCell
                    checked={selectedIds.has(String(trip.id))}
                    onChange={() => toggleOne(trip.id)}
                    label={`Select ${trip.trip_code}`}
                  />
                  <td className="px-4 py-3 font-mono">{trip.trip_code}</td>
                  <td className="px-4 py-3">{formatTripRoutesLabel(trip, routeById)}</td>
                  <td className="px-4 py-3">{trip.driver?.full_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    {trip.turn_boys?.length
                      ? trip.turn_boys.map((employee) => employee.full_name).join(", ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">{trip.vehicle?.plate_number ?? trip.vehicle?.vehicle_name ?? "—"}</td>
                  <td className="px-4 py-3">{trip.financial_summary?.order_count ?? trip.sales_count ?? 0}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-medium text-slate-800">
                      {formatSaleKes(trip.financial_summary?.total_amount ?? 0)}
                    </div>
                    <div className="text-xs text-slate-500">
                      Actual {formatSaleKes(trip.financial_summary?.actual_amount ?? trip.financial_summary?.total_amount ?? 0)}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {formatSaleKes(trip.financial_summary?.total_profit ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right font-medium text-emerald-800">
                    {formatSaleKes(trip.financial_summary?.net_profit ?? trip.financial_summary?.total_profit ?? 0)}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-700">
                    {formatTripProfitMargin(trip.financial_summary?.profit_margin_percent)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {trip.settled_at
                      ? "Settled"
                      : trip.expected_cash != null && Number(trip.expected_cash) > 0
                        ? formatTripCash(trip)
                        : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <span>{statusLabel(trip.status)}</span>
                      <TripDispatchStatusBadge status={trip.status} className="w-fit" />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3">
                      {trip.status === "in_transit" ? (
                        <Link
                          href={`/fulfillment/trips/${trip.id}/close`}
                          className="font-medium text-emerald-700 hover:underline"
                        >
                          Close
                        </Link>
                      ) : null}
                      <Link href={`/fulfillment/trips/${trip.id}`} className="text-[#185FA5] hover:underline">
                        Open
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <BatchActionBar count={selectedCount} onClear={clearSelection}>
        <button
          type="button"
          disabled={mergeableTrips.length < 2}
          className="rounded-lg bg-[var(--theme-primary)] px-3 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-[var(--theme-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => setMergeTripOpen(true)}
        >
          Merge trip charts
        </button>
      </BatchActionBar>
    </CatalogPageShell>
  );
}
