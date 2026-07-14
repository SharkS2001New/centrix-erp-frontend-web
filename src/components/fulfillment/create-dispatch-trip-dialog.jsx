"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  fetchDriversCached,
  fetchEmployeesCached,
  fetchRoutesCached,
  fetchVehiclesCached,
} from "@/lib/reference-data-cache";
import { Field, PrimaryButton, inputClassName } from "@/components/catalog/catalog-shared";
import { notifyError } from "@/lib/notify";

const EMPTY_LIST = [];

function isoDate(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function sortRoutes(routes) {
  return [...routes].sort((a, b) =>
    String(a.route_name ?? "").localeCompare(String(b.route_name ?? ""), undefined, {
      sensitivity: "base",
    }),
  );
}

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

export function CreateDispatchTripDialog({
  open,
  onClose,
  routes: routesProp,
  drivers: driversProp,
  vehicles: vehiclesProp,
  defaultDate = null,
  defaultRouteIds,
  defaultSaleIds,
  title = "Create trip chart",
  description = "Combine one or more routes on the same delivery run. Driver and vehicle are required.",
}) {
  const routesFromProps = routesProp ?? EMPTY_LIST;
  const driversFromProps = driversProp ?? EMPTY_LIST;
  const vehiclesFromProps = vehiclesProp ?? EMPTY_LIST;
  const initialRouteIds = defaultRouteIds ?? EMPTY_LIST;
  const saleIds = defaultSaleIds ?? EMPTY_LIST;
  const initialRouteIdsKey = useMemo(
    () => initialRouteIds.map((id) => String(id)).sort().join(","),
    [initialRouteIds],
  );
  const router = useRouter();
  const { user } = useAuth();
  const [scheduledDate, setScheduledDate] = useState(() => defaultDate ?? isoDate());
  const [selectedRouteIds, setSelectedRouteIds] = useState(() => new Set());
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [routesLoaded, setRoutesLoaded] = useState([]);
  const [driversLoaded, setDriversLoaded] = useState([]);
  const [vehiclesLoaded, setVehiclesLoaded] = useState([]);
  const [employeesLoaded, setEmployeesLoaded] = useState([]);
  const [refsLoading, setRefsLoading] = useState(false);
  const [selectedCrewEmployeeIds, setSelectedCrewEmployeeIds] = useState(() => new Set());

  useEffect(() => {
    if (!open) return;
    setScheduledDate(defaultDate ?? isoDate());
    const ids = initialRouteIdsKey ? initialRouteIdsKey.split(",") : [];
    setSelectedRouteIds(new Set(ids));
    setDriverId("");
    setVehicleId("");
    setSelectedCrewEmployeeIds(new Set());
    setNotes("");
  }, [open, defaultDate, initialRouteIdsKey]);

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
    const loadEmployees = fetchEmployeesCached(orgId).catch(() => []);

    Promise.all([
      fetchRoutesCached(orgId),
      loadDrivers,
      loadVehicles,
      loadEmployees,
    ])
      .then(([routes, drivers, vehicles, employees]) => {
        if (cancelled) return;
        setRoutesLoaded(routes ?? []);
        setDriversLoaded(drivers ?? []);
        setVehiclesLoaded(vehicles ?? []);
        setEmployeesLoaded(employees ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setRoutesLoaded([]);
          setDriversLoaded([]);
          setVehiclesLoaded([]);
          setEmployeesLoaded([]);
        }
      })
      .finally(() => {
        if (!cancelled) setRefsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, driversFromProps, vehiclesFromProps, user?.organization_id]);

  const routes = useMemo(() => {
    const byId = new Map();
    for (const route of [...routesFromProps, ...routesLoaded]) {
      if (route?.id != null) byId.set(route.id, route);
    }
    return sortRoutes([...byId.values()]);
  }, [routesFromProps, routesLoaded]);

  const drivers = useMemo(
    () => sortByName(dedupeById([...driversFromProps, ...driversLoaded])),
    [driversFromProps, driversLoaded],
  );
  const vehicles = useMemo(
    () => sortByName(dedupeById([...vehiclesFromProps, ...vehiclesLoaded]), "plate_number"),
    [vehiclesFromProps, vehiclesLoaded],
  );
  const employees = useMemo(
    () => sortByName(employeesLoaded),
    [employeesLoaded],
  );
  const selectedDriver = useMemo(
    () => drivers.find((driver) => String(driver.id) === String(driverId)),
    [drivers, driverId],
  );
  const selectedDriverEmployeeId =
    selectedDriver?.employee_id != null ? String(selectedDriver.employee_id) : "";

  useEffect(() => {
    if (!selectedDriverEmployeeId) return;
    setSelectedCrewEmployeeIds((prev) => {
      if (!prev.has(selectedDriverEmployeeId)) return prev;
      const next = new Set(prev);
      next.delete(selectedDriverEmployeeId);
      return next;
    });
  }, [selectedDriverEmployeeId]);

  const routesHint =
    initialRouteIds.length > 0
      ? "Some routes are already selected. Select more routes if any should share this trip chart."
      : "Select every route this vehicle will cover on the same run.";

  function toggleRoute(id) {
    const key = String(id);
    setSelectedRouteIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleCrewEmployee(id) {
    const key = String(id);
    if (selectedDriverEmployeeId && key === selectedDriverEmployeeId) {
      notifyError("The driver cannot also be selected as a turn boy.");
      return;
    }
    setSelectedCrewEmployeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const submit = useCallback(async () => {
    if (!driverId || !vehicleId) {
      notifyError("Select a driver and vehicle.");
      return;
    }

    const routeIds = [...selectedRouteIds].map((id) => Number(id)).filter((id) => id > 0);
    if (!routeIds.length && !saleIds.length) {
      notifyError("Select at least one route.");
      return;
    }

    setSaving(true);
    try {
      const trip = await apiRequest("/dispatch-trips", {
        method: "POST",
        body: {
          scheduled_date: scheduledDate,
          route_ids: routeIds,
          driver_id: Number(driverId),
          vehicle_id: Number(vehicleId),
          crew_employee_ids: [...selectedCrewEmployeeIds]
            .map((id) => Number(id))
            .filter((id) => id > 0),
          notes: notes.trim() || null,
          ...(saleIds.length ? { sale_ids: saleIds } : {}),
        },
      });
      onClose?.();
      router.push(`/fulfillment/trips/${trip.id}`);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to create trip chart");
    } finally {
      setSaving(false);
    }
  }, [scheduledDate, selectedRouteIds, driverId, vehicleId, selectedCrewEmployeeIds, notes, saleIds, onClose, router]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-40 bg-black/30"
        aria-label="Close dialog"
        onClick={onClose}
      />
      <div className="theme-panel fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border p-5 shadow-xl">
        <h2 className="text-base font-semibold theme-heading">{title}</h2>
        <p className="mt-1 text-sm theme-subtext">{description}</p>
        <div className="mt-4 space-y-3">
          <Field label="Scheduled date">
            <input
              type="date"
              className={inputClassName()}
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </Field>
          <Field label="Routes">
            <p className="mb-2 text-xs text-slate-500">{routesHint}</p>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {refsLoading && !routes.length ? (
                <p className="text-sm text-slate-500">Loading routes…</p>
              ) : routes.length ? (
                routes.map((route) => (
                  <label key={route.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={selectedRouteIds.has(String(route.id))}
                      onChange={() => toggleRoute(route.id)}
                    />
                    <span className="text-sm text-slate-800">
                      {route.route_name}
                      {route.direction ? <span className="text-slate-500"> · {route.direction}</span> : null}
                    </span>
                  </label>
                ))
              ) : (
                <p className="text-sm text-slate-500">No routes found.</p>
              )}
            </div>
          </Field>
          <Field label="Driver">
            <select
              className={inputClassName()}
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              disabled={refsLoading}
            >
              <option value="">{refsLoading ? "Loading drivers…" : "Select driver"}</option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.full_name ?? driver.driver_name ?? `Driver #${driver.id}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Vehicle">
            <select
              className={inputClassName()}
              value={vehicleId}
              onChange={(e) => setVehicleId(e.target.value)}
              disabled={refsLoading}
            >
              <option value="">{refsLoading ? "Loading vehicles…" : "Select vehicle"}</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.plate_number ?? vehicle.vehicle_name ?? `Vehicle #${vehicle.id}`}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Turn boys / works with (optional)">
            <p className="mb-2 text-xs text-slate-500">
              Select HR employees assigned to assist this trip. These links are kept with the trip for attendance and payroll reporting.
            </p>
            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {refsLoading && !employees.length ? (
                <p className="text-sm text-slate-500">Loading employees…</p>
              ) : employees.length ? (
                employees.map((employee) => {
                  const key = String(employee.id);
                  const isDriverEmployee = selectedDriverEmployeeId && key === selectedDriverEmployeeId;
                  return (
                    <label
                      key={employee.id}
                      className={`flex items-center gap-2 rounded px-2 py-1 ${
                        isDriverEmployee ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={Boolean(isDriverEmployee)}
                        checked={selectedCrewEmployeeIds.has(key)}
                        onChange={() => toggleCrewEmployee(employee.id)}
                      />
                      <span className="text-sm text-slate-800">
                        {employee.full_name ?? employee.employee_code ?? `Employee #${employee.id}`}
                        {employee.employee_code ? <span className="text-slate-500"> · {employee.employee_code}</span> : null}
                      </span>
                    </label>
                  );
                })
              ) : (
                <p className="text-sm text-slate-500">
                  No employees available, or your role cannot view HR employees.
                </p>
              )}
            </div>
          </Field>
          <Field label="Notes">
            <textarea
              className={inputClassName()}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional trip notes"
            />
          </Field>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="theme-secondary-btn rounded-lg border px-4 py-2 text-sm disabled:opacity-50"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </button>
          <PrimaryButton type="button" showIcon={false} disabled={saving} onClick={() => void submit()}>
            {saving ? "Creating…" : "Create trip chart"}
          </PrimaryButton>
        </div>
      </div>
    </>
  );
}
