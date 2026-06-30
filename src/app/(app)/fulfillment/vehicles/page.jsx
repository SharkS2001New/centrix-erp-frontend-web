"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import {
  CatalogPageShell,
  Field,
  FilterSelect,
  FormDrawer,
  IconButton,
  PencilIcon,
  PrimaryButton,
  SearchInput,
  StatCard,
  TrashIcon,
  inputClassName,
} from "@/components/catalog/catalog-shared";
import { CatalogListExport } from "@/components/catalog/catalog-list-export";
import { VEHICLE_EXPORT_COLUMNS } from "@/lib/catalog-list-exports";
import { useConfirm } from "@/lib/use-confirm";
import {
  EMPTY_VEHICLE_FORM,
  VehicleStatusBadge,
  buildVehicleBody,
  suggestVehicleCode,
  vehicleEmoji,
  vehicleToForm,
} from "@/components/fulfillment/fulfillment-shared";
import { notifyError, notifySuccess } from "@/lib/notify";
import { useListUrlSearch } from "@/lib/use-list-url-search";
import {
  BatchActionBar,
  BatchDeleteButton,
  TABLE_ROW_CHECKBOX_CLASS,
  batchDeleteWithConfirm,
  usePageRowSelection,
} from "@/components/catalog/table-row-selection";

export default function VehiclesPage() {
  const confirm = useConfirm();
  const { user } = useAuth();

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const { search, setSearch } = useListUrlSearch();
  const [statusFilter, setStatusFilter] = useState("all");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState("create");
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_VEHICLE_FORM);
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
      const [vehicleRes] = await Promise.all([
        apiRequest("/vehicles", { searchParams: { per_page: 200 } }),
      ]);
      setVehicles(vehicleRes.data ?? []);
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Failed to load vehicles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    const active = vehicles.filter((v) => v.is_active !== false);
    const inactive = vehicles.filter((v) => v.is_active === false);
    return {
      total: vehicles.length,
      active: active.length,
      inactive: inactive.length,
      withPlate: vehicles.filter((v) => v.plate_number).length,
    };
  }, [vehicles]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (statusFilter === "active" && v.is_active === false) return false;
      if (statusFilter === "inactive" && v.is_active !== false) return false;
      if (!q) return true;
      const hay = `${v.vehicle_name} ${v.plate_number} ${v.vehicle_code}`.toLowerCase();
      return hay.includes(q);
    });
  }, [vehicles, search, statusFilter]);

  const pageRowIds = useMemo(() => filtered.map((v) => v.id), [filtered]);
  const allOnPageSelected = isAllOnPageSelected(pageRowIds);
  const someOnPageSelected = isSomeOnPageSelected(pageRowIds);
  const vehicleById = useMemo(() => new Map(filtered.map((v) => [String(v.id), v])), [filtered]);
  const selectAllRef = useRef(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someOnPageSelected;
    }
  }, [someOnPageSelected]);

  function openCreateDrawer() {
    setDrawerMode("create");
    setEditingId(null);
    setForm({ ...EMPTY_VEHICLE_FORM });
    setFormError(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(vehicle) {
    setDrawerMode("edit");
    setEditingId(vehicle.id);
    setForm(vehicleToForm(vehicle));
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
      if (key === "plate_number" && drawerMode === "create" && !prev.vehicle_code.trim()) {
        next.vehicle_code = suggestVehicleCode(value);
      }
      return next;
    });
  }

  async function saveVehicle(e) {
    e.preventDefault();
    if (!user?.branch_id) {
      setFormError("Your user profile is missing a branch.");
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const body = buildVehicleBody(form, user.branch_id);
      if (drawerMode === "edit" && editingId != null) {
        await apiRequest(`/vehicles/${editingId}`, { method: "PUT", body });
      } else {
        await apiRequest("/vehicles", { method: "POST", body });
      }
      await loadData();
      closeDrawer();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteVehicle(vehicle) {
    const ok = await confirm({
      title: "Delete vehicle",
      message: `Delete vehicle "${vehicle.vehicle_name}"?`,
      confirmLabel: "Delete",
      destructive: true,
    });
    if (!ok) return;
    try {
      await apiRequest(`/vehicles/${vehicle.id}`, { method: "DELETE" });
      if (editingId === vehicle.id) closeDrawer();
      await loadData();
      notifySuccess(`"${vehicle.vehicle_name}" deleted`);
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Delete failed");
    }
  }

  async function deleteSelectedVehicles() {
    setBatchDeleting(true);
    try {
      await batchDeleteWithConfirm({
        confirm,
        selectedIds,
        entityName: "vehicle",
        deleteItem: async (id) => {
          await apiRequest(`/vehicles/${id}`, { method: "DELETE" });
        },
        clearSelection,
        reload: loadData,
        notifySuccess,
        notifyError,
        labelForId: (id) => vehicleById.get(String(id))?.vehicle_name ?? id,
      });
    } finally {
      setBatchDeleting(false);
    }
  }

  return (
    <CatalogPageShell
      title="Vehicles"
      subtitle="Fleet registration and vehicle status"
      action={
        <div className="flex flex-wrap items-center gap-2">
          <CatalogListExport
            title="Vehicles"
            apiPath="/vehicles"
            columns={VEHICLE_EXPORT_COLUMNS}
            totalCount={filtered.length}
            getSearchParams={() => ({ per_page: 200 })}
            disabled={loading}
          />
          <PrimaryButton onClick={openCreateDrawer}>Add vehicle</PrimaryButton>
        </div>
      }
      banner={
        !loading ? (
          <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Active vehicles" value={stats.active.toLocaleString()} />
            <StatCard label="Total fleet" value={stats.total.toLocaleString()} />
            <StatCard label="Inactive" value={stats.inactive.toLocaleString()} />
            <StatCard label="Registered plates" value={stats.withPlate.toLocaleString()} />
          </div>
        ) : null
      }
      toolbar={
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <SearchInput
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vehicle…"
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
        </div>
      }
    >
      {loading ? (
        <p className="text-sm text-slate-500">Loading vehicles…</p>
      ) : filtered.length === 0 ? (
        <p className="theme-panel rounded-xl border p-12 text-center text-sm text-slate-500">
          No vehicles found.
        </p>
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2">
            <input
              ref={selectAllRef}
              type="checkbox"
              className={TABLE_ROW_CHECKBOX_CLASS}
              checked={allOnPageSelected}
              onChange={(e) => toggleAllOnPage(e.target.checked, pageRowIds)}
              aria-label="Select all vehicles on this page"
            />
            <span className="text-sm text-slate-600">Select all on this page</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((vehicle) => (
            <article
              key={vehicle.id}
              className={`group relative theme-panel rounded-xl border p-5 shadow-sm transition hover:border-[#B5D4F4] hover:shadow-md ${
                selectedIds.has(String(vehicle.id)) ? "border-[#185FA5] ring-1 ring-[#185FA5]/30" : ""
              }`}
            >
              <div className="absolute left-3 top-3 z-10">
                <input
                  type="checkbox"
                  className={TABLE_ROW_CHECKBOX_CLASS}
                  checked={selectedIds.has(String(vehicle.id))}
                  onChange={() => toggleOne(vehicle.id)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Select ${vehicle.vehicle_name}`}
                />
              </div>
              <Link href={`/fulfillment/vehicles/${vehicle.id}`} className="block pl-6">
                <div className="text-3xl">{vehicleEmoji(vehicle.vehicle_name)}</div>
                <p className="mt-3 font-mono text-base font-semibold text-slate-900">
                  {vehicle.plate_number || vehicle.vehicle_code}
                </p>
                <p className="mt-0.5 text-sm text-slate-600">{vehicle.vehicle_name}</p>
                <div className="mt-3">
                  <VehicleStatusBadge active={vehicle.is_active !== false} />
                </div>
              </Link>
              <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition group-hover:opacity-100">
                <IconButton label="Edit" onClick={() => openEditDrawer(vehicle)}>
                  <PencilIcon />
                </IconButton>
                <IconButton label="Delete" danger onClick={() => deleteVehicle(vehicle)}>
                  <TrashIcon />
                </IconButton>
              </div>
            </article>
          ))}
          </div>
        </>
      )}

      <FormDrawer
        title={drawerMode === "edit" ? "Edit vehicle" : "Add vehicle"}
        open={drawerOpen}
        onClose={closeDrawer}
        onSubmit={saveVehicle}
        saving={saving}
        error={formError}
        submitLabel={drawerMode === "edit" ? "Save changes" : "Save vehicle"}
      >
        <Field label="Registration number">
          <input
            type="text"
            value={form.plate_number}
            onChange={(e) => updateField("plate_number", e.target.value.toUpperCase())}
            className={`${inputClassName()} font-mono`}
            placeholder="KBX 123A"
          />
        </Field>
        <Field label="Vehicle name">
          <input
            type="text"
            value={form.vehicle_name}
            onChange={(e) => updateField("vehicle_name", e.target.value)}
            required
            className={inputClassName()}
            placeholder="Isuzu NQR"
          />
        </Field>
        <Field label="Vehicle code">
          <input
            type="text"
            value={form.vehicle_code}
            onChange={(e) => updateField("vehicle_code", e.target.value.toUpperCase())}
            required
            className={`${inputClassName()} font-mono`}
            placeholder="KBX123A"
          />
        </Field>
        <Field label="Max load weight (kg)">
          <input
            type="number"
            min="0"
            step="any"
            value={form.max_weight_kg}
            onChange={(e) => updateField("max_weight_kg", e.target.value)}
            className={inputClassName()}
            placeholder="e.g. 3500"
          />
        </Field>
        <Field label="Max volume (m³)">
          <input
            type="number"
            min="0"
            step="any"
            value={form.max_volume_m3}
            onChange={(e) => updateField("max_volume_m3", e.target.value)}
            className={inputClassName()}
            placeholder="Optional"
          />
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
          onClick={() => void deleteSelectedVehicles()}
        />
      </BatchActionBar>
    </CatalogPageShell>
  );
}
