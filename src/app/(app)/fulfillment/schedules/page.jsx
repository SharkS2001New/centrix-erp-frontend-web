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
  FormDrawer,
  PrimaryButton,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { ROUTE_SCHEDULE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-shared";

const DAY_OPTIONS = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];

const EMPTY_FORM = {
  route_id: "",
  day_of_week: "1",
  default_driver_id: "",
  default_vehicle_id: "",
  departure_time: "",
  is_active: true,
};

export default function RouteSchedulesPage() {
  const { capabilities } = useAuth();
  const distributionEnabled = isDistributionOpsEnabled(capabilities);

  const [schedules, setSchedules] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadData = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const [scheduleRes, routeRes, driverRes, vehicleRes] = await Promise.all([
        apiRequest("/route-schedules", { searchParams: { per_page: 200 } }),
        apiRequest("/routes", { searchParams: { per_page: 200 } }),
        apiRequest("/drivers", { searchParams: { per_page: 200 } }),
        apiRequest("/vehicles", { searchParams: { per_page: 200 } }),
      ]);
      setSchedules(scheduleRes.data ?? []);
      setRoutes(routeRes.data ?? []);
      setDrivers(driverRes.data ?? []);
      setVehicles(vehicleRes.data ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load schedules");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const schedule of schedules) {
      const routeName = schedule.route?.route_name ?? routes.find((r) => r.id === schedule.route_id)?.route_name ?? `Route #${schedule.route_id}`;
      if (!map.has(routeName)) map.set(routeName, []);
      map.get(routeName).push(schedule);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [schedules, routes]);

  async function handleSave(e) {
    e.preventDefault();
    if (!form.route_id) {
      setFormError("Select a route.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await apiRequest("/route-schedules", {
        method: "POST",
        body: {
          route_id: Number(form.route_id),
          day_of_week: Number(form.day_of_week),
          default_driver_id: form.default_driver_id ? Number(form.default_driver_id) : null,
          default_vehicle_id: form.default_vehicle_id ? Number(form.default_vehicle_id) : null,
          departure_time: form.departure_time || null,
          is_active: Boolean(form.is_active),
        },
      });
      setDrawerOpen(false);
      setForm(EMPTY_FORM);
      await loadData();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(schedule) {
    try {
      await apiRequest(`/route-schedules/${schedule.id}`, {
        method: "PATCH",
        body: { is_active: !schedule.is_active },
      });
      await loadData();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update schedule");
    }
  }

  if (!distributionEnabled) {
    return (
      <CatalogPageShell title="Route schedules" subtitle="Recurring driver and vehicle assignments">
        <p className="text-sm text-slate-500">
          Enable distribution operations in <OrgSettingsPlatformHint area="Organization settings → Distribution" />.
          .
        </p>
      </CatalogPageShell>
    );
  }

  return (
    <CatalogPageShell
      title="Route schedules"
      subtitle="Assign default drivers and vehicles to routes by day of week"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Route schedules"
            filename="route-schedules"
            apiPath="/route-schedules"
            columns={ROUTE_SCHEDULE_EXPORT_COLUMNS}
            totalCount={schedules.length}
            getSearchParams={() => ({ per_page: 200 })}
            disabled={loading}
          />
          <PrimaryButton type="button" showIcon={false} onClick={() => setDrawerOpen(true)}>
            Add schedule
          </PrimaryButton>
        </div>
      }
    >
      <DashboardErrorBanner message={error} />

      {loading ? (
        <p className="text-sm text-slate-500">Loading schedules…</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-slate-500">No schedules yet. Add one to auto-suggest drivers when creating trips.</p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([routeName, items]) => (
            <section key={routeName} className="theme-panel rounded-xl border p-5 shadow-sm">
              <h2 className="text-base font-medium text-slate-900">{routeName}</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="py-2 pr-4">Day</th>
                      <th className="py-2 pr-4">Driver</th>
                      <th className="py-2 pr-4">Vehicle</th>
                      <th className="py-2 pr-4">Departure</th>
                      <th className="py-2 pr-4">Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items
                      .sort((a, b) => a.day_of_week - b.day_of_week)
                      .map((schedule) => (
                        <tr key={schedule.id} className="border-t border-slate-100">
                          <td className="py-2 pr-4">{DAY_OPTIONS.find((d) => d.value === schedule.day_of_week)?.label}</td>
                          <td className="py-2 pr-4">{schedule.default_driver?.full_name ?? "—"}</td>
                          <td className="py-2 pr-4">
                            {schedule.default_vehicle?.plate_number ?? schedule.default_vehicle?.vehicle_name ?? "—"}
                          </td>
                          <td className="py-2 pr-4">{schedule.departure_time?.slice(0, 5) ?? "—"}</td>
                          <td className="py-2 pr-4">
                            <button
                              type="button"
                              className={`rounded-full px-2 py-0.5 text-xs ${schedule.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}
                              onClick={() => toggleActive(schedule)}
                            >
                              {schedule.is_active ? "Active" : "Inactive"}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </div>
      )}

      <FormDrawer
        open={drawerOpen}
        title="Add route schedule"
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSave}
        saving={saving}
        error={formError}
      >
        <Field label="Route">
          <select
            className={inputClassName()}
            value={form.route_id}
            onChange={(e) => setForm((f) => ({ ...f, route_id: e.target.value }))}
          >
            <option value="">Select route…</option>
            {routes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.route_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Day of week">
          <select
            className={inputClassName()}
            value={form.day_of_week}
            onChange={(e) => setForm((f) => ({ ...f, day_of_week: e.target.value }))}
          >
            {DAY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default driver">
          <select
            className={inputClassName()}
            value={form.default_driver_id}
            onChange={(e) => setForm((f) => ({ ...f, default_driver_id: e.target.value }))}
          >
            <option value="">None</option>
            {drivers.filter((d) => d.is_active !== false).map((d) => (
              <option key={d.id} value={d.id}>
                {d.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default vehicle">
          <select
            className={inputClassName()}
            value={form.default_vehicle_id}
            onChange={(e) => setForm((f) => ({ ...f, default_vehicle_id: e.target.value }))}
          >
            <option value="">None</option>
            {vehicles.filter((v) => v.is_active !== false).map((v) => (
              <option key={v.id} value={v.id}>
                {v.plate_number ?? v.vehicle_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Departure time">
          <input
            type="time"
            className={inputClassName()}
            value={form.departure_time}
            onChange={(e) => setForm((f) => ({ ...f, departure_time: e.target.value }))}
          />
        </Field>
      </FormDrawer>
    </CatalogPageShell>
  );
}
