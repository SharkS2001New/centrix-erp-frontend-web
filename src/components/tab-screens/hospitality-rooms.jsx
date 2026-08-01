"use client";

import { useCallback, useMemo, useState } from "react";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  IconButton,
  inputClassName,
  PencilIcon,
  PrimaryButton,
  SECONDARY_BTN_CLASS,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
  TrashIcon,
} from "@/components/catalog/catalog-shared";
import { useConfirm } from "@/lib/use-confirm";
import { HospitalityPlaceholderScreen } from "@/components/hospitality/hospitality-screens";

const ROOM_STATUSES = [
  { value: "vacant", label: "Vacant" },
  { value: "occupied", label: "Occupied" },
  { value: "clean", label: "Clean" },
  { value: "dirty", label: "Dirty" },
  { value: "ooo", label: "Out of order" },
];

const EMPTY_TYPE = { code: "", name: "", base_rate: "0", max_occupancy: "2", is_active: true };
const EMPTY_ROOM = {
  room_type_id: "",
  room_number: "",
  floor: "",
  status: "vacant",
  is_active: true,
};

const EMPTY_PLAN = {
  room_type_id: "",
  code: "",
  name: "",
  amount: "0",
  is_default: false,
  is_active: true,
};

export function HospitalityRoomsScreen() {
  const { capabilities } = useAuth();
  const roomsEnabled = isHospitalityServiceEnabled(capabilities, "rooms");

  if (!roomsEnabled) {
    return (
      <HospitalityPlaceholderScreen
        title="Rooms"
        description="Rooms are not enabled for this organization. Ask your Centrix platform administrator to turn on the Rooms service."
      />
    );
  }

  return <HospitalityRoomsManager />;
}

function HospitalityRoomsManager() {
  const confirm = useConfirm();
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [typeDrawer, setTypeDrawer] = useState(false);
  const [typeMode, setTypeMode] = useState("create");
  const [editingTypeId, setEditingTypeId] = useState(null);
  const [typeForm, setTypeForm] = useState(EMPTY_TYPE);

  const [roomDrawer, setRoomDrawer] = useState(false);
  const [roomMode, setRoomMode] = useState("create");
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [roomForm, setRoomForm] = useState(EMPTY_ROOM);

  const [ratePlans, setRatePlans] = useState([]);
  const [planDrawer, setPlanDrawer] = useState(false);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [planForm, setPlanForm] = useState(EMPTY_PLAN);

  const loadData = useCallback(async () => {
    try {
      const [typesRes, roomsRes, plansRes] = await Promise.all([
        apiRequest("/hospitality/room-types", { searchParams: { per_page: 100 } }),
        apiRequest("/hospitality/rooms", { searchParams: { per_page: 200 } }),
        apiRequest("/hospitality/rate-plans"),
      ]);
      setRoomTypes(typesRes?.data ?? typesRes ?? []);
      setRooms(roomsRes?.data ?? roomsRes ?? []);
      setRatePlans(plansRes?.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load rooms");
    } finally {
      setLoading(false);
    }
  }, []);

  useTabAwareDataLoad(loadData);

  const typeById = useMemo(() => new Map(roomTypes.map((t) => [String(t.id), t])), [roomTypes]);

  function openCreateType() {
    setTypeMode("create");
    setEditingTypeId(null);
    setTypeForm({ ...EMPTY_TYPE });
    setFormError(null);
    setTypeDrawer(true);
  }

  function openEditType(row) {
    setTypeMode("edit");
    setEditingTypeId(row.id);
    setTypeForm({
      code: row.code ?? "",
      name: row.name ?? "",
      base_rate: String(row.base_rate ?? "0"),
      max_occupancy: String(row.max_occupancy ?? "2"),
      is_active: row.is_active !== false,
    });
    setFormError(null);
    setTypeDrawer(true);
  }

  function openCreateRoom() {
    setRoomMode("create");
    setEditingRoomId(null);
    setRoomForm({
      ...EMPTY_ROOM,
      room_type_id: roomTypes[0]?.id ? String(roomTypes[0].id) : "",
    });
    setFormError(null);
    setRoomDrawer(true);
  }

  function openEditRoom(row) {
    setRoomMode("edit");
    setEditingRoomId(row.id);
    setRoomForm({
      room_type_id: String(row.room_type_id ?? ""),
      room_number: row.room_number ?? "",
      floor: row.floor ?? "",
      status: row.status ?? "vacant",
      is_active: row.is_active !== false,
    });
    setFormError(null);
    setRoomDrawer(true);
  }

  async function saveType(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const body = {
      code: typeForm.code.trim().toUpperCase(),
      name: typeForm.name.trim(),
      base_rate: Number(typeForm.base_rate) || 0,
      max_occupancy: Number(typeForm.max_occupancy) || 2,
      is_active: Boolean(typeForm.is_active),
    };
    try {
      if (typeMode === "create") {
        await apiRequest("/hospitality/room-types", { method: "POST", body });
        notifySuccess("Room type created");
      } else {
        await apiRequest(`/hospitality/room-types/${editingTypeId}`, { method: "PUT", body });
        notifySuccess("Room type updated");
      }
      setTypeDrawer(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveRoom(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    const body = {
      room_type_id: Number(roomForm.room_type_id),
      room_number: roomForm.room_number.trim(),
      floor: roomForm.floor.trim() || null,
      status: roomForm.status,
      is_active: Boolean(roomForm.is_active),
    };
    try {
      if (roomMode === "create") {
        await apiRequest("/hospitality/rooms", { method: "POST", body });
        notifySuccess("Room created");
      } else {
        await apiRequest(`/hospitality/rooms/${editingRoomId}`, { method: "PUT", body });
        notifySuccess("Room updated");
      }
      setRoomDrawer(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function deleteType(row) {
    const ok = await confirm({
      title: "Delete room type",
      message: `Delete room type “${row.name}”? Rooms using it must be removed first.`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await apiRequest(`/hospitality/room-types/${row.id}`, { method: "DELETE" });
      notifySuccess("Deleted");
      await loadData();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  async function deleteRoom(row) {
    const ok = await confirm({
      title: "Delete room",
      message: `Delete room ${row.room_number}?`,
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await apiRequest(`/hospitality/rooms/${row.id}`, { method: "DELETE" });
      notifySuccess("Deleted");
      await loadData();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Delete failed");
    }
  }

  return (
    <CatalogPageShell
      title="Rooms"
      subtitle="Room types and room inventory for this hotel. Main outlet is always available for Hotel & Bar POS."
      action={
        <div className="flex flex-wrap gap-2">
          <button type="button" className={SECONDARY_BTN_CLASS} onClick={openCreateType}>
            Add room type
          </button>
          <button
            type="button"
            className={SECONDARY_BTN_CLASS}
            disabled={!roomTypes.length}
            onClick={() => {
              setEditingPlanId(null);
              setPlanForm({
                ...EMPTY_PLAN,
                room_type_id: roomTypes[0]?.id ? String(roomTypes[0].id) : "",
              });
              setFormError(null);
              setPlanDrawer(true);
            }}
          >
            Add rate plan
          </button>
          <PrimaryButton onClick={openCreateRoom} disabled={!roomTypes.length}>
            Add room
          </PrimaryButton>
        </div>
      }
    >
      {loading ? (
        <p className="theme-subtext text-sm">Loading…</p>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="theme-heading mb-2 text-sm font-semibold uppercase tracking-wide">Room types</h2>
            <div className={TABLE_SHELL_CLASS}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-right">Base rate</th>
                    <th className="px-3 py-2 text-center">Max occ.</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!roomTypes.length ? (
                    <tr>
                      <td colSpan={5} className="theme-subtext px-3 py-8 text-center">
                        No room types yet — add Standard / Deluxe to start.
                      </td>
                    </tr>
                  ) : (
                    roomTypes.map((row) => (
                      <tr key={row.id} className={TABLE_BODY_ROW_CLASS}>
                        <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(row.base_rate ?? 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-center">{row.max_occupancy}</td>
                        <td className="px-3 py-2 text-right">
                          <IconButton title="Edit" onClick={() => openEditType(row)}>
                            <PencilIcon />
                          </IconButton>
                          <IconButton title="Delete" onClick={() => void deleteType(row)}>
                            <TrashIcon />
                          </IconButton>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="theme-heading mb-2 text-sm font-semibold uppercase tracking-wide">Rate plans</h2>
            <div className={TABLE_SHELL_CLASS}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    <th className="px-3 py-2 text-left">Code</th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-left">Room type</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-left">Default</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!ratePlans.length ? (
                    <tr>
                      <td colSpan={6} className="theme-subtext px-3 py-8 text-center">
                        Optional named rates (BAR, Rack). Night audit uses default plan or room type base rate.
                      </td>
                    </tr>
                  ) : (
                    ratePlans.map((row) => (
                      <tr key={row.id} className={TABLE_BODY_ROW_CLASS}>
                        <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
                        <td className="px-3 py-2">{row.name}</td>
                        <td className="px-3 py-2">{row.room_type_name || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {Number(row.amount ?? 0).toLocaleString()}
                        </td>
                        <td className="px-3 py-2">{row.is_default ? "Yes" : "—"}</td>
                        <td className="px-3 py-2 text-right">
                          <IconButton
                            title="Edit"
                            onClick={() => {
                              setEditingPlanId(row.id);
                              setPlanForm({
                                room_type_id: String(row.room_type_id),
                                code: row.code || "",
                                name: row.name || "",
                                amount: String(row.amount ?? 0),
                                is_default: Boolean(row.is_default),
                                is_active: row.is_active !== false,
                              });
                              setFormError(null);
                              setPlanDrawer(true);
                            }}
                          >
                            <PencilIcon />
                          </IconButton>
                          <IconButton
                            title="Delete"
                            onClick={() =>
                              void (async () => {
                                if (!(await confirm({ title: "Delete rate plan?", message: row.name }))) return;
                                try {
                                  await apiRequest(`/hospitality/rate-plans/${row.id}`, { method: "DELETE" });
                                  notifySuccess("Rate plan deleted");
                                  await loadData();
                                } catch (e) {
                                  notifyError(e instanceof ApiError ? e.message : "Delete failed");
                                }
                              })()
                            }
                          >
                            <TrashIcon />
                          </IconButton>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="theme-heading mb-2 text-sm font-semibold uppercase tracking-wide">Rooms</h2>
            <div className={TABLE_SHELL_CLASS}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    <th className="px-3 py-2 text-left">Room</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Floor</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!rooms.length ? (
                    <tr>
                      <td colSpan={5} className="theme-subtext px-3 py-8 text-center">
                        No rooms yet.
                      </td>
                    </tr>
                  ) : (
                    rooms.map((row) => (
                      <tr key={row.id} className={TABLE_BODY_ROW_CLASS}>
                        <td className="px-3 py-2 font-semibold">{row.room_number}</td>
                        <td className="px-3 py-2">
                          {row.room_type?.name ?? typeById.get(String(row.room_type_id))?.name ?? "—"}
                        </td>
                        <td className="px-3 py-2">{row.floor || "—"}</td>
                        <td className="px-3 py-2 capitalize">{row.status}</td>
                        <td className="px-3 py-2 text-right">
                          <IconButton title="Edit" onClick={() => openEditRoom(row)}>
                            <PencilIcon />
                          </IconButton>
                          <IconButton title="Delete" onClick={() => void deleteRoom(row)}>
                            <TrashIcon />
                          </IconButton>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      <FormDrawer
        open={typeDrawer}
        title={typeMode === "create" ? "Add room type" : "Edit room type"}
        onClose={() => setTypeDrawer(false)}
        error={formError}
      >
        <form className="space-y-3" onSubmit={(e) => void saveType(e)}>
          <Field label="Code">
            <input
              className={inputClassName}
              value={typeForm.code}
              onChange={(e) => setTypeForm((p) => ({ ...p, code: e.target.value }))}
              required
            />
          </Field>
          <Field label="Name">
            <input
              className={inputClassName}
              value={typeForm.name}
              onChange={(e) => setTypeForm((p) => ({ ...p, name: e.target.value }))}
              required
            />
          </Field>
          <Field label="Base rate">
            <input
              type="number"
              min="0"
              step="0.01"
              className={inputClassName}
              value={typeForm.base_rate}
              onChange={(e) => setTypeForm((p) => ({ ...p, base_rate: e.target.value }))}
            />
          </Field>
          <Field label="Max occupancy">
            <input
              type="number"
              min="1"
              className={inputClassName}
              value={typeForm.max_occupancy}
              onChange={(e) => setTypeForm((p) => ({ ...p, max_occupancy: e.target.value }))}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={typeForm.is_active}
              onChange={(e) => setTypeForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            Active
          </label>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </form>
      </FormDrawer>

      <FormDrawer
        open={roomDrawer}
        title={roomMode === "create" ? "Add room" : "Edit room"}
        onClose={() => setRoomDrawer(false)}
        error={formError}
      >
        <form className="space-y-3" onSubmit={(e) => void saveRoom(e)}>
          <Field label="Room number">
            <input
              className={inputClassName}
              value={roomForm.room_number}
              onChange={(e) => setRoomForm((p) => ({ ...p, room_number: e.target.value }))}
              required
            />
          </Field>
          <Field label="Room type">
            <select
              className={inputClassName}
              value={roomForm.room_type_id}
              onChange={(e) => setRoomForm((p) => ({ ...p, room_type_id: e.target.value }))}
              required
            >
              <option value="">Select type…</option>
              {roomTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Floor">
            <input
              className={inputClassName}
              value={roomForm.floor}
              onChange={(e) => setRoomForm((p) => ({ ...p, floor: e.target.value }))}
            />
          </Field>
          <Field label="Status">
            <select
              className={inputClassName}
              value={roomForm.status}
              onChange={(e) => setRoomForm((p) => ({ ...p, status: e.target.value }))}
            >
              {ROOM_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={roomForm.is_active}
              onChange={(e) => setRoomForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            Active
          </label>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </form>
      </FormDrawer>

      <FormDrawer
        open={planDrawer}
        title={editingPlanId ? "Edit rate plan" : "Add rate plan"}
        onClose={() => setPlanDrawer(false)}
        error={formError}
      >
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void (async () => {
              setSaving(true);
              setFormError(null);
              const body = {
                room_type_id: Number(planForm.room_type_id),
                code: planForm.code.trim().toUpperCase(),
                name: planForm.name.trim(),
                amount: Number(planForm.amount) || 0,
                is_default: Boolean(planForm.is_default),
                is_active: Boolean(planForm.is_active),
              };
              try {
                if (editingPlanId) {
                  await apiRequest(`/hospitality/rate-plans/${editingPlanId}`, { method: "PUT", body });
                  notifySuccess("Rate plan updated");
                } else {
                  await apiRequest("/hospitality/rate-plans", { method: "POST", body });
                  notifySuccess("Rate plan created");
                }
                setPlanDrawer(false);
                await loadData();
              } catch (err) {
                setFormError(err instanceof ApiError ? err.message : "Save failed");
              } finally {
                setSaving(false);
              }
            })();
          }}
        >
          <Field label="Room type">
            <select
              className={inputClassName}
              required
              value={planForm.room_type_id}
              onChange={(e) => setPlanForm((p) => ({ ...p, room_type_id: e.target.value }))}
            >
              <option value="">Select…</option>
              {roomTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Code">
            <input
              className={inputClassName}
              required
              value={planForm.code}
              onChange={(e) => setPlanForm((p) => ({ ...p, code: e.target.value }))}
            />
          </Field>
          <Field label="Name">
            <input
              className={inputClassName}
              required
              value={planForm.name}
              onChange={(e) => setPlanForm((p) => ({ ...p, name: e.target.value }))}
            />
          </Field>
          <Field label="Amount / night">
            <input
              type="number"
              min="0"
              step="any"
              className={inputClassName}
              value={planForm.amount}
              onChange={(e) => setPlanForm((p) => ({ ...p, amount: e.target.value }))}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={planForm.is_default}
              onChange={(e) => setPlanForm((p) => ({ ...p, is_default: e.target.checked }))}
            />
            Default for this room type
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={planForm.is_active}
              onChange={(e) => setPlanForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            Active
          </label>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </form>
      </FormDrawer>
    </CatalogPageShell>
  );
}
