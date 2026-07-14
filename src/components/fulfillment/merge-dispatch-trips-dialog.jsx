"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { fetchDriversCached, fetchVehiclesCached } from "@/lib/reference-data-cache";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { formatTripRoutesLabel } from "@/lib/trip-routes";
import { notifyError } from "@/lib/notify";

const EMPTY_LIST = [];

function dedupeById(rows) {
  const byId = new Map();
  for (const row of rows) {
    if (row?.id != null) byId.set(row.id, row);
  }
  return [...byId.values()];
}

function sortByName(rows, key = "full_name") {
  return [...rows].sort((a, b) =>
    String(a[key] ?? a.vehicle_name ?? a.plate_number ?? "").localeCompare(
      String(b[key] ?? b.vehicle_name ?? b.plate_number ?? ""),
      undefined,
      { sensitivity: "base" },
    ),
  );
}

export function MergeDispatchTripsDialog({
  open,
  onClose,
  trips = EMPTY_LIST,
  drivers: driversProp,
  vehicles: vehiclesProp,
}) {
  const driversFromProps = driversProp ?? EMPTY_LIST;
  const vehiclesFromProps = vehiclesProp ?? EMPTY_LIST;
  const router = useRouter();
  const { user } = useAuth();
  const [targetTripId, setTargetTripId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [notes, setNotes] = useState("Merged trip chart");
  const [saving, setSaving] = useState(false);
  const [driversLoaded, setDriversLoaded] = useState([]);
  const [vehiclesLoaded, setVehiclesLoaded] = useState([]);
  const [refsLoading, setRefsLoading] = useState(false);

  const draftTrips = useMemo(
    () => trips.filter((trip) => trip.status === "draft"),
    [trips],
  );

  useEffect(() => {
    if (!open) return;
    setTargetTripId(draftTrips[0]?.id ? String(draftTrips[0].id) : "");
    setDriverId("");
    setVehicleId("");
    setNotes("Merged trip chart");
  }, [open, draftTrips]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setRefsLoading(true);
    const orgId = user?.organization_id;
    const loadDrivers = driversFromProps.length
      ? Promise.resolve(driversFromProps)
      : fetchDriversCached(orgId);
    const loadVehicles = vehiclesFromProps.length
      ? Promise.resolve(vehiclesFromProps)
      : fetchVehiclesCached(orgId);

    Promise.all([loadDrivers, loadVehicles])
      .then(([drivers, vehicles]) => {
        if (cancelled) return;
        setDriversLoaded(drivers ?? []);
        setVehiclesLoaded(vehicles ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setDriversLoaded([]);
          setVehiclesLoaded([]);
        }
      })
      .finally(() => {
        if (!cancelled) setRefsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, driversFromProps.length, vehiclesFromProps.length, user?.organization_id]);

  const drivers = useMemo(
    () => sortByName(dedupeById([...driversFromProps, ...driversLoaded])),
    [driversFromProps, driversLoaded],
  );
  const vehicles = useMemo(
    () => sortByName(dedupeById([...vehiclesFromProps, ...vehiclesLoaded]), "plate_number"),
    [vehiclesFromProps, vehiclesLoaded],
  );

  const submit = useCallback(async () => {
    if (draftTrips.length < 2) {
      notifyError("Select at least two draft trips to merge.");
      return;
    }
    if (!driverId || !vehicleId) {
      notifyError("Select a driver and vehicle.");
      return;
    }

    setSaving(true);
    try {
      const trip = await apiRequest("/dispatch-trips/merge", {
        method: "POST",
        body: {
          trip_ids: draftTrips.map((trip) => trip.id),
          target_trip_id: targetTripId ? Number(targetTripId) : null,
          driver_id: Number(driverId),
          vehicle_id: Number(vehicleId),
          notes: notes.trim() || null,
        },
      });
      onClose?.();
      router.push(`/fulfillment/trips/${trip.id}`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to merge trip charts");
    } finally {
      setSaving(false);
    }
  }, [draftTrips, targetTripId, driverId, vehicleId, notes, onClose, router]);

  if (!open) return null;

  return (
    <>
      <button type="button" className="fixed inset-0 z-40 bg-black/30" aria-label="Close dialog" onClick={onClose} />
      <div className="theme-panel fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border p-5 shadow-xl">
        <h2 className="text-base font-semibold theme-heading">Merge trip charts</h2>
        <p className="mt-1 text-sm theme-subtext">
          Combine auto-created or manual draft trips that go the same direction into one run.
        </p>
        <div className="mt-4 space-y-3">
          <Field label="Trips to merge">
            <ul className="rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
              {draftTrips.map((trip) => (
                <li key={trip.id} className="py-0.5">
                  <span className="font-mono text-slate-600">{trip.trip_code}</span>
                  {" · "}
                  {formatTripRoutesLabel(trip)}
                  {" · "}
                  {trip.sales_count ?? 0} orders
                </li>
              ))}
            </ul>
          </Field>
          <Field label="Keep trip code">
            <select
              className={inputClassName()}
              value={targetTripId}
              onChange={(e) => setTargetTripId(e.target.value)}
            >
              <option value="">Create new merged trip</option>
              {draftTrips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.trip_code} — {formatTripRoutesLabel(trip)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Driver">
            <select className={inputClassName()} value={driverId} onChange={(e) => setDriverId(e.target.value)} disabled={refsLoading}>
              <option value="">{refsLoading ? "Loading drivers…" : "Select driver"}</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name ?? driver.driver_name ?? `Driver #${driver.id}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vehicle">
            <select className={inputClassName()} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} disabled={refsLoading}>
              <option value="">{refsLoading ? "Loading vehicles…" : "Select vehicle"}</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate_number ?? vehicle.vehicle_name ?? `Vehicle #${vehicle.id}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes">
            <textarea className={inputClassName()} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="theme-secondary-btn rounded-lg border px-4 py-2 text-sm" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void submit()}>
            {saving ? "Merging…" : "Merge trips"}
          </PrimaryButton>
        </div>
      </div>
    </>
  );
}
