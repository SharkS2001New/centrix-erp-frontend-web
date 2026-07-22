"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import {
  fetchEmployeesCached,
  fetchRoutesCached,
  fetchUsersCached,
  fetchVehiclesCached,
} from "@/lib/reference-data-cache";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { buildPageParams, parsePaginator } from "@/lib/paginated-api";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  FormDrawer,
  IconButton,
  PaginationBar,
  PencilIcon,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  SearchInput,
  StatCard,
  TrashIcon,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { DRIVER_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { useConfirm } from "@/lib/use-confirm";
import {
  DriverStatusBadge,
  EMPTY_DRIVER_FORM,
  buildDriverBody,
  driverToForm,
  suggestDriverCode,
} from "@/components/fulfillment/fulfillment-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useListUrlSearch } from "@/lib/use-list-url-search";
import {
  BatchActionBar,
  BatchDeleteButton,
  TableRowSelectCell,
  TableSelectAllHeader,
  batchDeleteWithConfirm,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";


export function FulfillmentDriversScreen() {
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledParams = useRef("");
  const drawerOptionsLoadedRef = useRef(false);
  const { user } = useAuth();

  const [drivers, setDrivers] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [listLoading, setListLoading] = useState(false);
  const { search, setSearch, debouncedSearch } = useListUrlSearch();
  const [statusFilter, setStatusFilter] = useState("all");
  const [routeFilter, setRouteFilter] = useState("all");
  const [page, setPage] = useState(1);
  const { pageSize, setPageSize } = useListPageSize(10);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_DRIVER_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const {
    selectedIds,
    selectedCount,
    toggleOne,
    toggleAllOnPage,
    clearSelection,
    isAllOnPageSelected,
    isSomeOnPageSelected,
  } = usePageRowSelection();

  const loadReferenceData = useCallback(async () => {
    try {
      const orgId = user?.organization_id;
      const [routesData, vehiclesData] = await Promise.all([
        fetchRoutesCached(orgId),
        fetchVehiclesCached(orgId),
      ]);
      setRoutes(routesData ?? []);
      setVehicles(vehiclesData ?? []);
    } catch {
      /* non-blocking — filter/form selects degrade gracefully */
    }
  }, [user?.organization_id]);

  const loadDrivers = useCallback(async () => {
    setListLoading(true);
    try {
      const extra = {};
      if (statusFilter === "active") extra.is_active = 1;
      if (statusFilter === "inactive") extra.is_active = 0;
      if (routeFilter !== "all") extra.default_route_id = routeFilter;

      const searchParamsApi = buildPageParams({
        page,
        perPage: pageSize,
        q: debouncedSearch,
        extra,
      });
      const driverRes = await apiRequest("/drivers", { searchParams: searchParamsApi });
      const parsed = parsePaginator(driverRes);
      setDrivers(parsed.items);
      setTotal(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load drivers");
    } finally {
      setLoading(false);
      setListLoading(false);
    }
  }, [page, pageSize, debouncedSearch, statusFilter, routeFilter]);

  const loadDrawerOptions = useCallback(async () => {
    if (drawerOptionsLoadedRef.current) return;
    drawerOptionsLoadedRef.current = true;
    try {
      const orgId = user?.organization_id;
      const [usersData, employeesData] = await Promise.all([
        fetchUsersCached(orgId),
        fetchEmployeesCached(orgId).catch(() => []),
      ]);
      setUsers(usersData ?? []);
      setEmployees(employeesData ?? []);
    } catch {
      drawerOptionsLoadedRef.current = false;
    }
  }, [user?.organization_id]);

  useTabAwareDataLoad(loadReferenceData);
  useTabAwareDataLoad(loadDrivers);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, routeFilter]);

  const safePage = Math.min(page, totalPages);
  const pageRowIds = useMemo(() => drivers.map((d) => d.id), [drivers]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);
  const driverById = useMemo(() => new Map(drivers.map((d) => [String(d.id), d])), [drivers]);
  const tableLoading = loading || (listLoading && drivers.length === 0);

  function handlePageSizeChange(size) {
    setPageSize(size);
    setPage(1);
  }

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  function openCreateDrawer() {
    setDrawerMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_DRIVER_FORM });
    setFormError(null);
    setDrawerOpen(true);
    void loadDrawerOptions();
  }

  function openEditDrawer(driver) {
    setDrawerMode("edit");
    setEditingId(driver.id);
    setForm(driverToForm(driver));
    setFormError(null);
    setDrawerOpen(true);
    void loadDrawerOptions();
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setFormError(null);
  }

  function updateField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "employee_id") {
        const employee = employees.find((item) => String(item.id) === String(value));
        if (employee) {
          next.full_name = employee.full_name || [employee.first_name, employee.middle_name, employee.last_name].filter(Boolean).join(" ");
          next.phone = employee.phone ?? "";
          next.user_id = employee.user_id != null ? String(employee.user_id) : "";
          if (drawerMode === "create" && !prev.driver_code.trim()) {
            next.driver_code = suggestDriverCode(next.full_name);
          }
        } else {
          next.user_id = "";
        }
      }
      if (key === "full_name" && drawerMode === "create" && !prev.driver_code.trim()) {
        next.driver_code = suggestDriverCode(value);
      }
      return next;
    });
  }

  async function saveDriver(e) {
    e.preventDefault();
    if (!user?.branch_id) {
      setFormError("Your user profile is missing a branch.");
      return;
    }
    if (!form.driver_code.trim()) {
      setFormError("Driver code is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = buildDriverBody(form, user.branch_id);
      if (drawerMode === "edit" && editingId != null) {
        await apiRequest(`/drivers/${editingId}`, { method: "PUT", body });
      } else {
        await apiRequest("/drivers", { method: "POST", body });
      }
      await loadDrivers();
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (tableLoading) return;
    const editId = searchParams.get("edit");
    if (!editId || handledParams.current === editId) return;
    handledParams.current = editId;
    const driver = drivers.find((d) => String(d.id) === editId);
    if (driver) {
      openEditDrawer(driver);
    } else {
      apiRequest(`/drivers/${editId}`)
        .then(openEditDrawer)
        .catch(() => notifyError("Driver not found"));
    }
    router.replace("/fulfillment/drivers", { scroll: false });
  }, [tableLoading, searchParams, drivers, router]);

  async function deleteDriver(driver) {
    const ok = await confirm({
      title: "Delete driver",
      message: `Delete driver "${driver.full_name}"?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/drivers/${driver.id}`, { method: "DELETE" });
      if (editingId === driver.id) closeDrawer();
      await loadDrivers();
      notifySuccess(`"${driver.full_name}" deleted`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function deleteSelectedDrivers() {
    setBatchDeleting(true);
    try {
      await batchDeleteWithConfirm({
        confirm,
        selectedIds,
        entityName: "driver",
        deleteItem: async (id) => {
          await apiRequest(`/drivers/${id}`, { method: "DELETE" });
        },
        clearSelection,
        reload: loadDrivers,
        notifySuccess,
        notifyError,
        labelForId: (id) => driverById.get(String(id))?.full_name ?? id,
      });
    } finally {
      setBatchDeleting(false);
    }
  }

  const buildExportSearchParams = useCallback(() => {
    const extra = {};
    if (statusFilter === "active") extra.is_active = 1;
    if (statusFilter === "inactive") extra.is_active = 0;
    if (routeFilter !== "all") extra.default_route_id = routeFilter;
    return buildPageParams({
      page: 1,
      perPage: 200,
      q: debouncedSearch,
      extra,
    });
  }, [debouncedSearch, statusFilter, routeFilter]);

  return (
    <CatalogPageShell
      title="Drivers"
      subtitle="Manage delivery drivers and assignments"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void loadDrivers()}
            disabled={loading || listLoading}
            className={SECONDARY_BTN_CLASS}
          >
            {loading || listLoading ? "Refreshing…" : "Refresh"}
          </button>
          <CatalogListExport
            title="Drivers"
            apiPath="/drivers"
            columns={DRIVER_EXPORT_COLUMNS}
            totalCount={total}
            getSearchParams={buildExportSearchParams}
            disabled={loading || listLoading}
          />
          <PrimaryButton onClick={openCreateDrawer}>Add driver</PrimaryButton>
        </div>
      }
      banner={
        !tableLoading ? (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total drivers" value={total.toLocaleString()} />
          </div>
        ) : null
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search driver…"
          />
          <FilterSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
            ]}
          />
          <FilterSelect
            value={routeFilter}
            onChange={(e) => setRouteFilter(e.target.value)}
            options={[
              { value: "all", label: "All routes" },
              ...routes.map((r) => ({ value: String(r.id), label: r.route_name })),
            ]}
          />
        </div>
      }
    >
      <div className="theme-panel theme-table-shell overflow-hidden rounded-xl shadow-sm">
        {tableLoading ? (
          <p className="p-8 text-sm text-slate-500">Loading drivers…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <TableSelectAllHeader
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected}
                      onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                    />
                    <th className="px-4 py-2.5">Driver</th>
                    <th className="px-4 py-2.5">Phone</th>
                    <th className="px-4 py-2.5">Employee</th>
                    <th className="px-4 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Route</th>
                    <th className="px-4 py-2.5">Vehicle</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="w-[110px] px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-12 text-center text-slate-500">
                        No drivers found.
                      </td>
                    </tr>
                  ) : (
                    drivers.map((driver) => (
                      <tr
                        key={driver.id}
                        className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                      >
                        <TableRowSelectCell
                          checked={selectedIds.has(String(driver.id))}
                          onChange={() => toggleOne(driver.id)}
                          label={`Select ${driver.full_name}`}
                        />
                        <td className="px-4 py-3">
                          <Link
                            href={`/fulfillment/drivers/${driver.id}`}
                            className="font-medium text-[#185FA5] hover:underline"
                          >
                            {driver.full_name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{driver.phone || "—"}</td>
                        <td className="px-4 py-3 text-slate-700">
                          {driver.employee?.full_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {driver.driver_code}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {driver.default_route?.route_name ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-slate-700">
                          {driver.default_vehicle?.vehicle_name ??
                            driver.default_vehicle?.plate_number ??
                            "—"}
                        </td>
                        <td className="px-4 py-3">
                          <DriverStatusBadge active={driver.is_active !== false} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <IconButton
                              label="View"
                              onClick={() => router.push(`/fulfillment/drivers/${driver.id}`)}
                            >
                              <ViewIcon />
                            </IconButton>
                            <IconButton label="Edit" onClick={() => openEditDrawer(driver)}>
                              <PencilIcon />
                            </IconButton>
                            <IconButton label="Delete" danger onClick={() => deleteDriver(driver)}>
                              <TrashIcon />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
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
      </div>

      <FormDrawer
        title={drawerMode === "edit" ? "Edit driver" : "Add driver"}
        open={drawerOpen}
        onClose={closeDrawer}
        onSubmit={saveDriver}
        saving={saving}
        error={formError}
        submitLabel={drawerMode === "edit" ? "Save changes" : "Save driver"}
      >
        <Field label="Employee record (optional)">
          <select
            value={form.employee_id}
            onChange={(e) => updateField("employee_id", e.target.value)}
            className={inputClassName()}
          >
            <option value="">Standalone driver / not an employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={String(employee.id)}>
                {employee.full_name ?? employee.employee_code ?? `Employee #${employee.id}`}
                {employee.employee_code ? ` · ${employee.employee_code}` : ""}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            If the driver is already an HR employee, link this record instead of creating duplicate details.
          </p>
        </Field>
        <Field label="Full name">
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => updateField("full_name", e.target.value)}
            required
            disabled={Boolean(form.employee_id)}
            className={inputClassName()}
            placeholder="John Kamau"
          />
        </Field>
        <Field label="Phone number">
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            disabled={Boolean(form.employee_id)}
            className={inputClassName()}
            placeholder="0712345678"
          />
        </Field>
        <Field label="Driver code">
          <input
            type="text"
            value={form.driver_code}
            onChange={(e) => updateField("driver_code", e.target.value.toUpperCase())}
            required
            className={`${inputClassName()} font-mono`}
            placeholder="JK-001"
          />
        </Field>
        <Field label="Default route (optional)">
          <select
            value={form.default_route_id}
            onChange={(e) => updateField("default_route_id", e.target.value)}
            className={inputClassName()}
          >
            <option value="">None</option>
            {routes.map((r) => (
              <option key={r.id} value={String(r.id)}>
                {r.route_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Default vehicle (optional)">
          <select
            value={form.default_vehicle_id}
            onChange={(e) => updateField("default_vehicle_id", e.target.value)}
            className={inputClassName()}
          >
            <option value="">None</option>
            {vehicles.map((v) => (
              <option key={v.id} value={String(v.id)}>
                {v.vehicle_name || v.plate_number || v.vehicle_code}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Linked user (optional)">
          <select
            value={form.user_id}
            onChange={(e) => updateField("user_id", e.target.value)}
            disabled={Boolean(form.employee_id && form.user_id)}
            className={inputClassName()}
          >
            <option value="">None</option>
            {users.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.full_name ?? u.username}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="text-sm text-slate-900">Status</span>
          <div className="flex gap-4 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                checked={form.is_active}
                onChange={() => updateField("is_active", true)}
                className="text-[#185FA5]"
              />
              Active
            </label>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                checked={!form.is_active}
                onChange={() => updateField("is_active", false)}
                className="text-[#185FA5]"
              />
              Inactive
            </label>
          </div>
        </div>
      </FormDrawer>

      <BatchActionBar count={selectedCount} onClear={clearSelection}>
        <BatchDeleteButton
          count={selectedCount}
          busy={batchDeleting}
          onClick={() => void deleteSelectedDrivers()}
        />
      </BatchActionBar>
    </CatalogPageShell>
  );
}

function ViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
