"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiRequest } from "@/lib/api";
import { formatShortDate, getSaleTimestamp } from "@/components/catalog/catalog-shared";
import {
  VehicleStatusBadge,
  vehicleEmoji,
  vehicleRecentTrips,
} from "@/components/fulfillment/fulfillment-shared";

export default function VehicleProfilePage() {
  const params = useParams();
  const vehicleId = Number(params.id);

  const [vehicle, setVehicle] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [vehicleData, routeRes, deliveriesRes] = await Promise.all([
        apiRequest(`/vehicles/${vehicleId}`),
        apiRequest("/routes", { searchParams: { per_page: 200 } }),
        apiRequest(`/vehicles/${vehicleId}/deliveries`, { searchParams: { per_page: 50 } }),
      ]);
      setVehicle(vehicleData);
      setRoutes(routeRes.data ?? []);
      setSales(deliveriesRes.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vehicle");
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const routeById = useMemo(() => new Map(routes.map((r) => [r.id, r])), [routes]);

  const trips = useMemo(
    () =>
      vehicleRecentTrips(sales, vehicleId).map((sale) => ({
        sale,
        routeName: routeById.get(sale.route_id)?.route_name ?? "Route delivery",
        date: getSaleTimestamp(sale),
      })),
    [sales, vehicleId, routeById],
  );

  return (
    <div className="-m-6 min-h-[calc(100%+3rem)] bg-slate-50 p-6 text-slate-900 md:-m-8 md:min-h-[calc(100%+4rem)] md:p-8">
      <div className="mb-6">
        <Link href="/fulfillment/vehicles" className="text-sm text-[#185FA5] hover:text-[#144f8a]">
          ← Back to vehicles
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading vehicle…</p>
      ) : vehicle ? (
        <>
          <div className="mb-6 flex flex-wrap items-start gap-4">
            <div className="text-4xl">{vehicleEmoji(vehicle.vehicle_name)}</div>
            <div>
              <h1 className="font-mono text-xl font-semibold text-slate-900">
                {vehicle.plate_number || vehicle.vehicle_code}
              </h1>
              <p className="text-sm text-slate-600">{vehicle.vehicle_name}</p>
              <div className="mt-2">
                <VehicleStatusBadge active={vehicle.is_active !== false} />
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-[15px] font-medium text-slate-900">Vehicle profile</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <DetailRow label="Registration" value={vehicle.plate_number || "—"} mono />
                <DetailRow label="Vehicle code" value={vehicle.vehicle_code} mono />
                <DetailRow label="Name" value={vehicle.vehicle_name} />
                <DetailRow label="Branch" value={vehicle.branch?.branch_name ?? "—"} />
                <DetailRow label="Created" value={formatShortDate(vehicle.created_at)} />
              </dl>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-[15px] font-medium text-slate-900">Recent trips</h2>
              <p className="mt-0.5 text-xs text-slate-500">Completed deliveries linked to this vehicle</p>
              {trips.length === 0 ? (
                <p className="mt-6 text-sm text-slate-500">No recent trips recorded.</p>
              ) : (
                <ul className="mt-4 divide-y divide-slate-100">
                  {trips.map(({ sale, routeName, date }) => (
                    <li key={sale.id ?? sale.order_num} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium text-slate-800">{routeName}</p>
                        <p className="text-xs text-slate-500">
                          Order #{sale.order_num} · {formatShortDate(date)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-medium text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}
