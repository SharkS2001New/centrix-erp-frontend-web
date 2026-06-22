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
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-shared";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "loading", label: "Loading" },
  { value: "in_transit", label: "In transit" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function statusLabel(status) {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
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
  const [dateFilter, setDateFilter] = useState(() => isoDate());

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [tripRes, routeRes] = await Promise.all([
        apiRequest("/dispatch-trips", {
          searchParams: {
            per_page: 200,
            from_date: dateFilter,
            to_date: dateFilter,
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
  }, [dateFilter, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter((t) => {
      const routeName = routes.find((r) => r.id === t.route_id)?.route_name ?? "";
      return (
        String(t.trip_code).toLowerCase().includes(q) ||
        routeName.toLowerCase().includes(q) ||
        String(t.driver?.full_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [trips, routes, search]);

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
        <PrimaryLink href="/fulfillment/dispatch">Dispatch board</PrimaryLink>
      }
    >
      <DashboardErrorBanner message={error} />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard label="Trips today" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Completed" value={stats.completed} />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchInput value={search} onChange={setSearch} placeholder="Search trip, route, driver…" className="max-w-xs" />
        <Field label="Date">
          <input type="date" className={inputClassName()} value={dateFilter} onChange={(e) => setDateFilter(e.target.value)} />
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
        <p className="text-sm text-slate-500">No trips for this date. Create one from the dispatch board.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Trip</th>
                <th className="px-4 py-3">Route</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">Vehicle</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Cash</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((trip) => (
                <tr key={trip.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-mono">{trip.trip_code}</td>
                  <td className="px-4 py-3">{trip.route?.route_name ?? "—"}</td>
                  <td className="px-4 py-3">{trip.driver?.full_name ?? "—"}</td>
                  <td className="px-4 py-3">{trip.vehicle?.plate_number ?? trip.vehicle?.vehicle_name ?? "—"}</td>
                  <td className="px-4 py-3">{trip.sales_count ?? 0}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {trip.settled_at
                      ? "Settled"
                      : trip.expected_cash != null && Number(trip.expected_cash) > 0
                        ? formatTripCash(trip)
                        : "—"}
                  </td>
                  <td className="px-4 py-3 capitalize">{statusLabel(trip.status)}</td>
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
    </CatalogPageShell>
  );
}
