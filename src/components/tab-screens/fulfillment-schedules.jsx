"use client";

import { OrgSettingsPlatformHint } from "@/components/admin/org-settings-platform-hint";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { fetchFulfillmentRefsCached } from "@/lib/reference-data-cache";
import { isDistributionOpsEnabled } from "@/lib/distribution-settings";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  IconButton,
  PaginationBar,
  PencilIcon,
  PrimaryButton,
  SearchInput,
  TrashIcon,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { ROUTE_SCHEDULE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { DashboardErrorBanner } from "@/components/dashboard/dashboard-shared";
import { useConfirm } from "@/lib/use-confirm";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { useListUrlSearch } from "@/lib/use-list-url-search";

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

function scheduleToForm(schedule) {
  return {
    route_id: schedule.route_id != null ? String(schedule.route_id) : "",
    day_of_week: schedule.day_of_week != null ? String(schedule.day_of_week) : "1",
    default_driver_id: schedule.default_driver_id != null ? String(schedule.default_driver_id) : "",
    default_vehicle_id: schedule.default_vehicle_id != null ? String(schedule.default_vehicle_id) : "",
    departure_time: schedule.departure_time ? String(schedule.departure_time).slice(0, 5) : "",
    is_active: schedule.is_active !== false,
  };
}

function dayLabel(dayOfWeek) {
  return DAY_OPTIONS.find((d) => d.value === dayOfWeek)?.label ?? `Day ${dayOfWeek}`;
}

export function FulfillmentSchedulesScreen() {
  const confirm = useConfirm();
  const { capabilities, user } = useAuth();
  const distributionEnabled = isDistributionOpsEnabled(capabilities);

  const [schedules, setSchedules] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const [error, setError] = useState(null);
  const { search, setSearch, debouncedSearch } = useListUrlSearch();
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const loadRefs = useCallback(async () => {
    try {
      const refs = await fetchFulfillmentRefsCached(user?.organization_id);
      setRoutes(refs.routes ?? []);
      setDrivers(refs.drivers ?? []);
      setVehicles(refs.vehicles ?? []);
    } catch {
      /* non-blocking for form selects */
    }
  }, [user?.organization_id]);

  const loadData = useCallback(async () => {
    setError(null);
    setListLoading(true);
    try {
      const searchParamsApi = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
      });
      const scheduleRes = await apiRequest("/route-schedules", { searchParams: searchParamsApi });
      const parsed = parsePaginator(scheduleRes);
      setSchedules(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load schedules");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [page, pageSize, debouncedSearch]);

  useTabAwareDataLoad(loadRefs);
  useTabAwareDataLoad(loadData);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch]);

  const grouped = useMemo(() => {
    const map = new Map();
    for (const schedule of schedules) {
      const routeName =
        schedule.route?.route_name ??
        routes.find((r) => r.id === schedule.route_id)?.route_name ??
        `Route #${schedule.route_id}`;
      if (!map.has(routeName)) map.set(routeName, []);
      map.get(routeName).push(schedule);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [schedules, routes]);

  const safePage = Math.min(page, totalPages);
  const tableLoading = loading || (listLoading && schedules.length === 0);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  function openCreateDrawer() {
    setDrawerMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_FORM });
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(schedule) {
    setDrawerMode("edit");
    setEditingId(schedule.id);
    setForm(scheduleToForm(schedule));
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!form.route_id) {
      setFormError("Select a route.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = {
        route_id: Number(form.route_id),
        day_of_week: Number(form.day_of_week),
        default_driver_id: form.default_driver_id ? Number(form.default_driver_id) : null,
        default_vehicle_id: form.default_vehicle_id ? Number(form.default_vehicle_id) : null,
        departure_time: form.departure_time || null,
        is_active: Boolean(form.is_active),
      };
      if (drawerMode === "edit" && editingId != null) {
        await apiRequest(`/route-schedules/${editingId}`, { method: "PUT", body });
        notifySuccess("Schedule updated");
      } else {
        await apiRequest("/route-schedules", { method: "POST", body });
        notifySuccess("Schedule created");
      }
      closeDrawer();
      setForm(EMPTY_FORM);
      await loadData();
    } catch (e) {
      setFormError(e instanceof ApiError ? e.message : "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSchedule(schedule) {
    const routeName =
      schedule.route?.route_name ??
      routes.find((r) => r.id === schedule.route_id)?.route_name ??
      `Route #${schedule.route_id}`;
    const ok = await confirm({
      title: "Delete route schedule",
      message: `Delete the ${dayLabel(schedule.day_of_week)} schedule for "${routeName}"?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/route-schedules/${schedule.id}`, { method: "DELETE" });
      if (editingId === schedule.id) closeDrawer();
      await loadData();
      notifySuccess("Schedule deleted");
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to delete schedule");
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

  const buildExportSearchParams = useCallback(
    () =>
      buildPageParams({
        page: 1,
        perPage: 200,
        q: debouncedSearch,
      }),
    [debouncedSearch],
  );

  if (!distributionEnabled) {
    return (
      <CatalogPageShell title="Route schedules" subtitle="Recurring driver and vehicle assignments">
        <p className="text-sm text-slate-500">
          Enable distribution operations in <OrgSettingsPlatformHint area="Organization settings → Distribution" />.
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
            totalCount={total}
            getSearchParams={buildExportSearchParams}
            disabled={loading || listLoading}
          />
          <PrimaryButton type="button" showIcon={false} onClick={openCreateDrawer}>
            Add schedule
          </PrimaryButton>
        </div>
      }
    >
      <DashboardErrorBanner message={error} />

      <div className="mb-4 max-w-md">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search route, driver, or vehicle…"
        />
      </div>

      {tableLoading ? (
        <p className="text-sm text-slate-500">Loading schedules…</p>
      ) : grouped.length === 0 ? (
        <p className="text-sm text-slate-500">No schedules yet. Add one to auto-suggest drivers when creating trips.</p>
      ) : (
        <>
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
                        <th className="py-2 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items
                        .sort((a, b) => a.day_of_week - b.day_of_week)
                        .map((schedule) => (
                          <tr key={schedule.id} className="border-t border-slate-100">
                            <td className="py-2 pr-4">{dayLabel(schedule.day_of_week)}</td>
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
                            <td className="py-2">
                              <div className="flex justify-end gap-1">
                                <IconButton label="Edit schedule" onClick={() => openEditDrawer(schedule)}>
                                  <PencilIcon />
                                </IconButton>
                                <IconButton label="Delete schedule" onClick={() => deleteSchedule(schedule)}>
                                  <TrashIcon />
                                </IconButton>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
          <PaginationBar
            page={safePage}
            totalPages={totalPages}
            total={total}
            pageSize={pageSize}
            onChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </>
      )}

      <FormDrawer
        open={drawerOpen}
        title={drawerMode === "edit" ? "Edit route schedule" : "Add route schedule"}
        onClose={closeDrawer}
        onSubmit={handleSave}
        saving={saving}
        error={formError}
        submitLabel={drawerMode === "edit" ? "Save changes" : "Save schedule"}
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
