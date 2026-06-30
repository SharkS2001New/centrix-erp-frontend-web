"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  FormDrawer,
  IconButton,
  PaginationBar,
  PencilIcon,
  PrimaryButton,
  SearchInput,
  StatCard,
  TrashIcon,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { useListPageSize } from "@/lib/use-list-page-controls";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { DRIVER_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import {
  DriverStatusBadge,
  EMPTY_DRIVER_FORM,
  buildDriverBody,
  countDeliveriesByDriver,
  driverToForm,
  suggestDriverCode,
  todayDeliveryStats,
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


export default function DriversPage() {
  const confirm = useConfirm();
  const router = useRouter();
  const searchParams = useSearchParams();
  const handledParams = useRef("");
  const { user } = useAuth();

  const [drivers, setDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [users, setUsers] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const { search, setSearch } = useListUrlSearch();
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

  const loadData = useCallback(async () => {
    try {
      const [driverRes, routeRes, vehicleRes, userRes, salesRes] = await Promise.all([
        apiRequest("/drivers", { searchParams: { per_page: 200 } }),
        apiRequest("/routes", { searchParams: { per_page: 200 } }),
        apiRequest("/vehicles", { searchParams: { per_page: 200 } }),
        apiRequest("/users", { searchParams: { per_page: 200 } }),
        apiRequest("/sales", { searchParams: { per_page: 500 } }),
      ]);
      setDrivers(driverRes.data ?? []);
      setRoutes(routeRes.data ?? []);
      setVehicles(vehicleRes.data ?? []);
      setUsers(userRes.data ?? []);
      setSales(salesRes.data ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load drivers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    const active = drivers.filter((d) => d.is_active !== false);
    const linkedUsers = drivers.filter((d) => d.user_id != null);
    const deliveriesToday = countDeliveriesByDriver(sales, "day");
    let deliveriesCount = 0;
    for (const count of deliveriesToday.values()) deliveriesCount += count;
    const { completed, pending } = todayDeliveryStats(sales);
    return {
      total: drivers.length,
      active: active.length,
      linkedUsers: linkedUsers.length,
      deliveriesToday: deliveriesCount,
      completedToday: completed,
      pendingToday: pending,
    };
  }, [drivers, sales]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return drivers.filter((d) => {
      if (statusFilter === "active" && d.is_active === false) return false;
      if (statusFilter === "inactive" && d.is_active !== false) return false;
      if (routeFilter !== "all" && String(d.default_route_id ?? "") !== routeFilter) return false;
      if (q) {
        const hay = `${d.full_name} ${d.phone} ${d.driver_code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [drivers, search, statusFilter, routeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageSlice = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageRowIds = useMemo(() => pageSlice.map((d) => d.id), [pageSlice]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);
  const driverById = useMemo(() => new Map(pageSlice.map((d) => [String(d.id), d])), [pageSlice]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, routeFilter]);

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
  }

  function openEditDrawer(driver) {
    setDrawerMode("edit");
    setEditingId(driver.id);
    setForm(driverToForm(driver));
    setFormError(null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setFormError(null);
  }

  function updateField(key, value) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
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
      await loadData();
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (loading) return;
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
  }, [loading, searchParams, drivers, router]);

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
      await loadData();
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
        reload: loadData,
        notifySuccess,
        notifyError,
        labelForId: (id) => driverById.get(String(id))?.full_name ?? id,
      });
    } finally {
      setBatchDeleting(false);
    }
  }

  return (
    <CatalogPageShell
      title="Drivers"
      subtitle="Manage delivery drivers and assignments"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Drivers"
            apiPath="/drivers"
            columns={DRIVER_EXPORT_COLUMNS}
            totalCount={filtered.length}
            getSearchParams={() => ({ per_page: 200 })}
            disabled={loading}
          />
          <PrimaryButton onClick={openCreateDrawer}>Add driver</PrimaryButton>
        </div>
      }
      banner={
        !loading ? (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active drivers" value={stats.active.toLocaleString()} />
            <StatCard label="Total drivers" value={stats.total.toLocaleString()} />
            <StatCard label="Linked users" value={stats.linkedUsers.toLocaleString()} />
            <StatCard
              label="Deliveries today"
              value={`${stats.completedToday} done · ${stats.pendingToday} pending`}
            />
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
        {loading ? (
          <p className="p-8 text-sm text-slate-500">Loading drivers…</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="theme-table-head-row text-left text-xs font-medium">
                    <TableSelectAllHeader
                      checked={allOnPageSelected}
                      indeterminate={someOnPageSelected}
                      onChange={(checked) => toggleAllOnPage(checked, pageRowIds)}
                    />
                    <th className="px-4 py-2.5">Driver</th>
                    <th className="px-4 py-2.5">Phone</th>
                    <th className="px-4 py-2.5">Code</th>
                    <th className="px-4 py-2.5">Route</th>
                    <th className="px-4 py-2.5">Vehicle</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="w-[110px] px-4 py-2.5">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-slate-500">
                        No drivers found.
                      </td>
                    </tr>
                  ) : (
                    pageSlice.map((driver) => (
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
              total={filtered.length}
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
        <Field label="Full name">
          <input
            type="text"
            value={form.full_name}
            onChange={(e) => updateField("full_name", e.target.value)}
            required
            className={inputClassName()}
            placeholder="John Kamau"
          />
        </Field>
        <Field label="Phone number">
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => updateField("phone", e.target.value)}
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
