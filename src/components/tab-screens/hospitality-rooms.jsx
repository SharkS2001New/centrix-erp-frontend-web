"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { apiRequest, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/auth-context";
import { useTabAwareDataLoad } from "@/contexts/tab-pane-activity-context";
import { notifyError, notifySuccess } from "@/lib/notify";
import { isHospitalityServiceEnabled } from "@/lib/hospitality-services";
import { addDaysToCalendarDate, formatAppDateTime, todayCalendarDate } from "@/lib/datetime";
import {
  expandHotelRoomNumbers,
  occupancySourceLabel,
} from "@/lib/hospitality-room-numbers";
import {
  CatalogPageShell,
  Field,
  FormDrawer,
  IconButton,
  inputClassName,
  PencilIcon,
  PrimaryButton,
  SearchableSelect,
  SECONDARY_BTN_CLASS,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
  TrashIcon,
} from "@/components/catalog/catalog-shared";
import { useConfirm } from "@/lib/use-confirm";
import { HospitalityPlaceholderScreen } from "@/components/hospitality/hospitality-screens";

const HOUSEKEEPING_STATUSES = [
  { value: "vacant", label: "Vacant" },
  { value: "clean", label: "Clean" },
  { value: "dirty", label: "Dirty" },
  { value: "ooo", label: "Out of order" },
];

const CREATE_STATUSES = HOUSEKEEPING_STATUSES.filter((s) => s.value === "vacant" || s.value === "clean");

const EMPTY_TYPE = { code: "", name: "", base_rate: "0", max_occupancy: "2", is_active: true };
const EMPTY_ROOM = {
  room_type_id: "",
  room_number: "",
  start_number: "",
  count: "10",
  floor: "",
  status: "vacant",
  is_active: true,
  create_mode: "single",
};

const EMPTY_ASSIGN = {
  room_id: "",
  guest_name: "",
  guest_phone: "",
  departure_date: "",
};

const EMPTY_PLAN = {
  room_type_id: "",
  code: "",
  name: "",
  amount: "0",
  is_default: false,
  is_active: true,
};

function nightlyRateForType(type, ratePlans) {
  const typeId = Number(type?.id);
  const def = ratePlans.find(
    (p) => Number(p.room_type_id) === typeId && p.is_default && p.is_active !== false,
  );
  return Number(def?.amount ?? type?.base_rate ?? 0);
}

export function HospitalityRoomsScreen() {
  const { capabilities } = useAuth();
  const roomsEnabled = isHospitalityServiceEnabled(capabilities, "rooms");

  if (!roomsEnabled) {
    return (
      <HospitalityPlaceholderScreen
        title="Rooms"
        description="Rooms are not enabled for this organization. Ask your Centrix platform administrator to turn on the Rooms service."
        serviceKey="rooms"
      />
    );
  }

  return <HospitalityRoomsManager />;
}

function HospitalityRoomsManager() {
  const { capabilities } = useAuth();
  const frontDeskEnabled = isHospitalityServiceEnabled(capabilities, "front_desk");
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
  const [editingRoom, setEditingRoom] = useState(null);

  const [assignDrawer, setAssignDrawer] = useState(false);
  const [assignForm, setAssignForm] = useState(EMPTY_ASSIGN);

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
  const availableRooms = useMemo(
    () =>
      rooms.filter(
        (r) =>
          ["vacant", "clean"].includes(r.status) &&
          r.is_active !== false &&
          !r.occupancy_source,
      ),
    [rooms],
  );
  const rangePreview = useMemo(() => {
    if (roomForm.create_mode !== "range") return [];
    try {
      return expandHotelRoomNumbers(roomForm.start_number || roomForm.room_number, Number(roomForm.count) || 0);
    } catch {
      return [];
    }
  }, [roomForm.create_mode, roomForm.start_number, roomForm.room_number, roomForm.count]);

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
    setEditingRoom(null);
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
    setEditingRoom(row);
    setRoomForm({
      room_type_id: String(row.room_type_id ?? ""),
      room_number: row.room_number ?? "",
      start_number: "",
      count: "10",
      floor: row.floor ?? "",
      status: row.status === "occupied" ? "occupied" : (row.status ?? "vacant"),
      is_active: row.is_active !== false,
      create_mode: "single",
    });
    setFormError(null);
    setRoomDrawer(true);
  }

  function openAssignRoom(row) {
    setAssignForm({
      room_id: String(row.id),
      guest_name: row.guest_name ?? "",
      guest_phone: row.guest_phone ?? "",
      departure_date: addDaysToCalendarDate(todayCalendarDate(), 1),
    });
    setFormError(null);
    setAssignDrawer(true);
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
    try {
      if (roomMode === "create" && roomForm.create_mode === "range") {
        const start = (roomForm.start_number || roomForm.room_number).trim();
        await apiRequest("/hospitality/rooms/bulk", {
          method: "POST",
          body: {
            room_type_id: Number(roomForm.room_type_id),
            start_number: start,
            count: Number(roomForm.count),
            floor: roomForm.floor.trim() || null,
          },
        });
        notifySuccess(`Created ${Number(roomForm.count)} rooms`);
      } else {
        const body = {
          room_type_id: Number(roomForm.room_type_id),
          room_number: roomForm.room_number.trim(),
          floor: roomForm.floor.trim() || null,
          is_active: Boolean(roomForm.is_active),
        };
        if (roomForm.status !== "occupied") {
          body.status = roomForm.status;
        }
        if (roomMode === "create") {
          await apiRequest("/hospitality/rooms", { method: "POST", body });
          notifySuccess("Room created");
        } else {
          await apiRequest(`/hospitality/rooms/${editingRoomId}`, { method: "PUT", body });
          notifySuccess("Room updated");
        }
      }
      setRoomDrawer(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveAssign(e) {
    e.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      await apiRequest("/hospitality/front-desk/check-in", {
        method: "POST",
        body: {
          guest_name: assignForm.guest_name.trim(),
          guest_phone: assignForm.guest_phone.trim() || null,
          room_id: Number(assignForm.room_id),
          departure_date: assignForm.departure_date,
        },
      });
      notifySuccess("Room assigned");
      setAssignDrawer(false);
      await loadData();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Assign failed");
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
      subtitle="Create room types with a nightly rate, then add vacant rooms Hotel POS can sell. Assign guests here or at Front desk — occupancy is never set by flipping a status dropdown."
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
          {frontDeskEnabled ? (
            <button
              type="button"
              className={SECONDARY_BTN_CLASS}
              disabled={!availableRooms.length}
              onClick={() =>
                openAssignRoom(availableRooms[0] ?? { id: "", guest_name: "", guest_phone: "" })
              }
            >
              Assign guest
            </button>
          ) : null}
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
                    <th className="px-3 py-2 text-right">POS nightly rate</th>
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
                          {nightlyRateForType(row, ratePlans) > 0
                            ? nightlyRateForType(row, ratePlans).toLocaleString()
                            : "—"}
                          {nightlyRateForType(row, ratePlans) <= 0 ? (
                            <span className="theme-subtext ml-1 text-xs">set a rate for POS</span>
                          ) : null}
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
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <h2 className="theme-heading text-sm font-semibold uppercase tracking-wide">Rooms</h2>
              <p className="theme-subtext text-xs">
                {frontDeskEnabled ? (
                  <>
                    Assign a vacant/clean room to a walk-in, or sell prepaid stays from{" "}
                    <Link href="/hotel-bar-pos" className="font-semibold underline">
                      Hotel POS
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    Front desk is off — guests occupy a room when they pay the stay on{" "}
                    <Link href="/hotel-bar-pos" className="font-semibold underline">
                      Hotel POS
                    </Link>
                    .
                  </>
                )}
              </p>
            </div>
            <div className={TABLE_SHELL_CLASS}>
              <table className="min-w-full text-sm">
                <thead>
                  <tr className={TABLE_HEAD_ROW_CLASS}>
                    <th className="px-3 py-2 text-left">Room</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Floor</th>
                    <th className="px-3 py-2 text-right">Nightly</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-left">Guest / assignment</th>
                    <th className="px-3 py-2 text-left">POS</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {!rooms.length ? (
                    <tr>
                      <td colSpan={8} className="theme-subtext px-3 py-8 text-center">
                        No rooms yet — add a type with a nightly rate, then create rooms 101–110 as vacant.
                      </td>
                    </tr>
                  ) : (
                    rooms.map((row) => {
                      const typeName =
                        row.room_type?.name ?? typeById.get(String(row.room_type_id))?.name ?? "—";
                      const occupied = Boolean(row.occupancy_source) || row.status === "occupied";
                      return (
                        <tr key={row.id} className={TABLE_BODY_ROW_CLASS}>
                          <td className="px-3 py-2 font-semibold">{row.room_number}</td>
                          <td className="px-3 py-2">{typeName}</td>
                          <td className="px-3 py-2">{row.floor || "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {Number(row.nightly_rate ?? 0) > 0
                              ? Number(row.nightly_rate).toLocaleString()
                              : "—"}
                          </td>
                          <td className="px-3 py-2 capitalize">{row.status}</td>
                          <td className="px-3 py-2">
                            {occupied ? (
                              <div>
                                <p>{row.guest_name || "Guest"}</p>
                                <p className="theme-subtext text-xs">
                                  {occupancySourceLabel(row.occupancy_source)}
                                  {row.expected_checkout_at
                                    ? ` · out ${formatAppDateTime(row.expected_checkout_at)}`
                                    : ""}
                                </p>
                              </div>
                            ) : (
                              <span className="theme-subtext">{occupancySourceLabel(row.occupancy_source)}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {row.pos_sellable ? "Sellable" : occupied ? "In house" : "Not sellable"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {frontDeskEnabled && !occupied && ["vacant", "clean"].includes(row.status) ? (
                              <button
                                type="button"
                                className={`${SECONDARY_BTN_CLASS} mr-1 px-2 py-1 text-xs`}
                                onClick={() => openAssignRoom(row)}
                              >
                                Assign
                              </button>
                            ) : null}
                            <IconButton title="Edit" onClick={() => openEditRoom(row)}>
                              <PencilIcon />
                            </IconButton>
                            <IconButton title="Delete" onClick={() => void deleteRoom(row)}>
                              <TrashIcon />
                            </IconButton>
                          </td>
                        </tr>
                      );
                    })
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
              className={inputClassName()}
              value={typeForm.code}
              onChange={(e) => setTypeForm((p) => ({ ...p, code: e.target.value }))}
              required
            />
          </Field>
          <Field label="Name">
            <input
              className={inputClassName()}
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
              className={inputClassName()}
              value={typeForm.base_rate}
              onChange={(e) => setTypeForm((p) => ({ ...p, base_rate: e.target.value }))}
            />
            <p className="theme-subtext mt-1 text-xs">
              Hotel POS sells this type at the default rate plan, or this base rate if none is set. Use 0 only if the type should not appear on the till.
            </p>
          </Field>
          <Field label="Max occupancy">
            <input
              type="number"
              min="1"
              className={inputClassName()}
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
          {roomMode === "edit" && editingRoom?.occupancy_source ? (
            <p className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-surface-muted)] px-3 py-2 text-sm">
              Occupied by {editingRoom.guest_name || "guest"} via{" "}
              {occupancySourceLabel(editingRoom.occupancy_source)}
              {editingRoom.expected_checkout_at
                ? ` until ${formatAppDateTime(editingRoom.expected_checkout_at)}`
                : ""}
              . Reassign or check out at{" "}
              <Link href="/hospitality/front-desk" className="font-semibold underline">
                Front desk
              </Link>
              {editingRoom.sold_check_id ? " — or void the Hotel POS check." : "."}
            </p>
          ) : null}
          {roomMode === "create" ? (
            <Field label="Create">
              <SearchableSelect
                className={inputClassName()}
                value={roomForm.create_mode}
                onChange={(v) => setRoomForm((p) => ({ ...p, create_mode: v }))}
                options={[
                  { value: "single", label: "One room" },
                  { value: "range", label: "Numbered range (101–110)" },
                ]}
              />
            </Field>
          ) : null}
          {roomMode === "create" && roomForm.create_mode === "range" ? (
            <>
              <Field label="First room number">
                <input
                  className={inputClassName()}
                  value={roomForm.start_number}
                  onChange={(e) => setRoomForm((p) => ({ ...p, start_number: e.target.value }))}
                  placeholder="101"
                  required
                />
              </Field>
              <Field label="How many">
                <input
                  type="number"
                  min="1"
                  max="50"
                  className={inputClassName()}
                  value={roomForm.count}
                  onChange={(e) => setRoomForm((p) => ({ ...p, count: e.target.value }))}
                  required
                />
              </Field>
              {rangePreview.length ? (
                <p className="theme-subtext text-xs">
                  Will create {rangePreview[0]}
                  {rangePreview.length > 1 ? `–${rangePreview[rangePreview.length - 1]}` : ""} as vacant.
                </p>
              ) : null}
            </>
          ) : (
            <Field label="Room number">
              <input
                className={inputClassName()}
                value={roomForm.room_number}
                onChange={(e) => setRoomForm((p) => ({ ...p, room_number: e.target.value }))}
                required={roomForm.create_mode !== "range"}
              />
            </Field>
          )}
          <Field label="Room type">
            <SearchableSelect
              className={inputClassName()}
              value={roomForm.room_type_id}
              onChange={(v) => setRoomForm((p) => ({ ...p, room_type_id: v }))}
              required
              placeholder="Select type…"
              options={[
                { value: "", label: "Select type…" },
                ...roomTypes.map((t) => ({
                  value: String(t.id),
                  label: `${t.name}${nightlyRateForType(t, ratePlans) > 0 ? "" : " · no POS rate"}`,
                })),
              ]}
            />
          </Field>
          <Field label="Floor">
            <input
              className={inputClassName()}
              value={roomForm.floor}
              onChange={(e) => setRoomForm((p) => ({ ...p, floor: e.target.value }))}
              placeholder="1"
            />
          </Field>
          {editingRoom?.occupancy_source ? null : (
            <Field label="Housekeeping status">
              <SearchableSelect
                className={inputClassName()}
                value={roomForm.status}
                onChange={(v) => setRoomForm((p) => ({ ...p, status: v }))}
                options={roomMode === "create" ? CREATE_STATUSES : HOUSEKEEPING_STATUSES}
              />
            </Field>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={roomForm.is_active}
              onChange={(e) => setRoomForm((p) => ({ ...p, is_active: e.target.checked }))}
            />
            Active (Hotel POS only lists active vacant/clean rooms)
          </label>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </form>
      </FormDrawer>

      <FormDrawer
        open={assignDrawer}
        title="Assign room"
        onClose={() => setAssignDrawer(false)}
        error={formError}
      >
        <form className="space-y-3" onSubmit={(e) => void saveAssign(e)}>
          <p className="theme-subtext text-xs">
            Same assignment as Front desk walk-in. Vacant and clean rooms only — Hotel POS prepaid stays stay on the till until checkout or void.
          </p>
          <Field label="Room">
            <SearchableSelect
              className={inputClassName()}
              value={assignForm.room_id}
              onChange={(v) => setAssignForm((p) => ({ ...p, room_id: v }))}
              required
              placeholder="Select vacant/clean room…"
              options={[
                { value: "", label: "Select vacant/clean room…" },
                ...availableRooms.map((r) => ({
                  value: String(r.id),
                  label: `${r.room_number}${r.room_type?.name ? ` · ${r.room_type.name}` : ""} (${r.status})`,
                })),
              ]}
            />
          </Field>
          <Field label="Guest name">
            <input
              className={inputClassName()}
              required
              value={assignForm.guest_name}
              onChange={(e) => setAssignForm((p) => ({ ...p, guest_name: e.target.value }))}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputClassName()}
              value={assignForm.guest_phone}
              onChange={(e) => setAssignForm((p) => ({ ...p, guest_phone: e.target.value }))}
            />
          </Field>
          <Field label="Departure date">
            <input
              type="date"
              className={inputClassName()}
              required
              value={assignForm.departure_date}
              onChange={(e) => setAssignForm((p) => ({ ...p, departure_date: e.target.value }))}
            />
          </Field>
          <PrimaryButton type="submit" disabled={saving}>
            {saving ? "Assigning…" : "Assign room"}
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
            <SearchableSelect
              className={inputClassName()}
              required
              value={planForm.room_type_id}
              onChange={(v) => setPlanForm((p) => ({ ...p, room_type_id: v }))}
              placeholder="Select…"
              options={[
                { value: "", label: "Select…" },
                ...roomTypes.map((t) => ({
                  value: String(t.id),
                  label: t.name,
                })),
              ]}
            />
          </Field>
          <Field label="Code">
            <input
              className={inputClassName()}
              required
              value={planForm.code}
              onChange={(e) => setPlanForm((p) => ({ ...p, code: e.target.value }))}
            />
          </Field>
          <Field label="Name">
            <input
              className={inputClassName()}
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
              className={inputClassName()}
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
