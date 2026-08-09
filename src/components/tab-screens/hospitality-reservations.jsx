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
  FilterSelect,
  FormDrawer,
  inputClassName,
  PrimaryButton,
  SearchableSelect,
  SecondaryButton,
  TABLE_BODY_ROW_CLASS,
  TABLE_HEAD_ROW_CLASS,
  TABLE_SHELL_CLASS,
} from "@/components/catalog/catalog-shared";
import { HospitalityPlaceholderScreen } from "@/components/hospitality/hospitality-screens";

const EMPTY = {
  guest_name: "",
  guest_phone: "",
  room_type_id: "",
  room_id: "",
  rate_plan_id: "",
  arrival_date: "",
  departure_date: "",
  deposit_amount: "0",
  adults: "1",
  notes: "",
};

const STATUS_COLORS = {
  booked: "bg-sky-100 text-sky-900",
  checked_in: "bg-emerald-100 text-emerald-900",
  checked_out: "bg-slate-100 text-slate-700",
  cancelled: "bg-rose-100 text-rose-900",
  no_show: "bg-amber-100 text-amber-950",
};

function addDays(iso, days) {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

export function HospitalityReservationsScreen() {
  const { capabilities } = useAuth();
  if (!isHospitalityServiceEnabled(capabilities, "reservations")) {
    return (
      <HospitalityPlaceholderScreen
        title="Reservations"
        description="Bookings and arrivals."
        serviceKey="reservations"
      />
    );
  }
  return <ReservationsManager />;
}

function ReservationsManager() {
  const [view, setView] = useState("list"); // list | rack
  const [rows, setRows] = useState([]);
  const [rackRows, setRackRows] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [ratePlans, setRatePlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("booked");
  const [q, setQ] = useState("");
  const [rackFrom, setRackFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [drawer, setDrawer] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const rackTo = useMemo(() => addDays(rackFrom, 14), [rackFrom]);
  const rackDays = useMemo(() => {
    const out = [];
    for (let i = 0; i < 14; i += 1) out.push(addDays(rackFrom, i));
    return out;
  }, [rackFrom]);

  const load = useCallback(async () => {
    try {
      const [res, types, rms, plans] = await Promise.all([
        apiRequest("/hospitality/reservations", {
          searchParams: { status: status || undefined, q: q || undefined, per_page: 100 },
        }),
        apiRequest("/hospitality/room-types", { searchParams: { per_page: 100 } }),
        apiRequest("/hospitality/rooms", { searchParams: { per_page: 200 } }),
        apiRequest("/hospitality/rate-plans"),
      ]);
      setRows(res?.data ?? []);
      setRoomTypes(types?.data ?? types ?? []);
      setRooms(rms?.data ?? rms ?? []);
      setRatePlans(plans?.data ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load reservations");
    } finally {
      setLoading(false);
    }
  }, [status, q]);

  const loadRack = useCallback(async () => {
    try {
      const [res, rms] = await Promise.all([
        apiRequest("/hospitality/reservations", {
          searchParams: {
            overlap_from: rackFrom,
            overlap_to: rackTo,
            per_page: 200,
          },
        }),
        apiRequest("/hospitality/rooms", { searchParams: { per_page: 200 } }),
      ]);
      setRackRows(res?.data ?? []);
      setRooms(rms?.data ?? rms ?? []);
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Failed to load room rack");
    }
  }, [rackFrom, rackTo]);

  useTabAwareDataLoad(view === "rack" ? loadRack : load);

  const roomsForType = useMemo(
    () => rooms.filter((r) => String(r.room_type_id) === String(form.room_type_id)),
    [rooms, form.room_type_id],
  );
  const plansForType = useMemo(
    () => ratePlans.filter((p) => String(p.room_type_id) === String(form.room_type_id)),
    [ratePlans, form.room_type_id],
  );

  const activeRooms = useMemo(
    () =>
      [...rooms]
        .filter((r) => r.is_active !== false)
        .sort((a, b) => String(a.room_number).localeCompare(String(b.room_number), undefined, { numeric: true })),
    [rooms],
  );

  function openCreate() {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = addDays(today, 1);
    setEditingId(null);
    setForm({ ...EMPTY, arrival_date: today, departure_date: tomorrow });
    setDrawer(true);
  }

  function openEdit(row) {
    setEditingId(row.id);
    setForm({
      guest_name: row.guest_name || "",
      guest_phone: row.guest_phone || "",
      room_type_id: row.room_type_id ? String(row.room_type_id) : "",
      room_id: row.room_id ? String(row.room_id) : "",
      rate_plan_id: row.rate_plan_id ? String(row.rate_plan_id) : "",
      arrival_date: row.arrival_date || "",
      departure_date: row.departure_date || "",
      deposit_amount: String(row.deposit_amount ?? 0),
      adults: String(row.adults ?? 1),
      notes: row.notes || "",
    });
    setDrawer(true);
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = {
        ...form,
        room_type_id: Number(form.room_type_id),
        room_id: form.room_id ? Number(form.room_id) : null,
        rate_plan_id: form.rate_plan_id ? Number(form.rate_plan_id) : null,
        deposit_amount: Number(form.deposit_amount) || 0,
        adults: Number(form.adults) || 1,
      };
      if (editingId) {
        await apiRequest(`/hospitality/reservations/${editingId}`, { method: "PUT", body });
        notifySuccess("Reservation updated");
      } else {
        await apiRequest("/hospitality/reservations", { method: "POST", body });
        notifySuccess("Reservation created");
      }
      setDrawer(false);
      if (view === "rack") await loadRack();
      else await load();
    } catch (err) {
      notifyError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function setResStatus(id, next) {
    try {
      await apiRequest(`/hospitality/reservations/${id}/status`, {
        method: "POST",
        body: { status: next },
      });
      notifySuccess(next === "cancelled" ? "Cancelled" : "Marked no-show");
      if (view === "rack") await loadRack();
      else await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Update failed");
    }
  }

  return (
    <CatalogPageShell
      title="Reservations"
      subtitle="Book rooms, track arrivals, and view the 14-day room rack."
      action={
        <PrimaryButton showIcon onClick={openCreate}>
          New reservation
        </PrimaryButton>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {[
          ["list", "List"],
          ["rack", "Room rack"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setView(id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              view === id ? "theme-primary-btn" : "theme-secondary-btn border"
            }`}
          >
            {label}
          </button>
        ))}
        {view === "list" ? (
          <>
            <FilterSelect
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              options={[
                { value: "", label: "All statuses" },
                { value: "booked", label: "Booked" },
                { value: "checked_in", label: "Checked in" },
                { value: "checked_out", label: "Checked out" },
                { value: "cancelled", label: "Cancelled" },
                { value: "no_show", label: "No-show" },
              ]}
            />
            <input
              className={`${inputClassName()} max-w-xs`}
              placeholder="Search guest / code…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <SecondaryButton onClick={() => void load()}>Refresh</SecondaryButton>
          </>
        ) : (
          <>
            <Field label="From">
              <input
                type="date"
                className={inputClassName()}
                value={rackFrom}
                onChange={(e) => setRackFrom(e.target.value)}
              />
            </Field>
            <SecondaryButton onClick={() => void loadRack()}>Refresh rack</SecondaryButton>
          </>
        )}
      </div>

      {loading ? <p className="theme-subtext text-sm">Loading…</p> : null}

      {!loading && view === "list" ? (
        <div className={TABLE_SHELL_CLASS}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Guest</th>
                <th className="px-3 py-2 text-left">Dates</th>
                <th className="px-3 py-2 text-left">Room</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={TABLE_BODY_ROW_CLASS}>
                  <td className="px-3 py-2 font-medium">{row.confirmation_code}</td>
                  <td className="px-3 py-2">{row.guest_name}</td>
                  <td className="px-3 py-2">
                    {row.arrival_date} → {row.departure_date}
                  </td>
                  <td className="px-3 py-2">{row.room_number || row.room_type_name || "—"}</td>
                  <td className="px-3 py-2 capitalize">{String(row.status || "").replace(/_/g, " ")}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {row.status === "booked" ? (
                        <>
                          <SecondaryButton onClick={() => openEdit(row)}>Edit</SecondaryButton>
                          <SecondaryButton onClick={() => void setResStatus(row.id, "cancelled")}>
                            Cancel
                          </SecondaryButton>
                          <SecondaryButton onClick={() => void setResStatus(row.id, "no_show")}>
                            No-show
                          </SecondaryButton>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="theme-subtext px-3 py-8 text-center">
                    No reservations.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      {!loading && view === "rack" ? (
        <div className="overflow-x-auto rounded-xl border border-[var(--theme-border)]">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr className="bg-[var(--theme-page-bg)]">
                <th className="sticky left-0 z-10 border-b border-[var(--theme-border)] bg-[var(--theme-page-bg)] px-2 py-2 text-left">
                  Room
                </th>
                {rackDays.map((day) => (
                  <th
                    key={day}
                    className="min-w-[72px] border-b border-l border-[var(--theme-border)] px-1 py-2 text-center font-medium"
                  >
                    {day.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeRooms.map((room) => {
                const stays = rackRows.filter((r) => Number(r.room_id) === Number(room.id));
                return (
                  <tr key={room.id}>
                    <td className="sticky left-0 z-10 border-b border-[var(--theme-border)] bg-[var(--theme-surface)] px-2 py-1 font-semibold">
                      {room.room_number}
                      <span className="theme-subtext ml-1 font-normal capitalize">{room.status}</span>
                    </td>
                    <td colSpan={14} className="relative border-b border-[var(--theme-border)] p-0">
                      <div className="relative h-10">
                        <div
                          className="pointer-events-none absolute inset-0 grid"
                          style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}
                        >
                          {rackDays.map((day) => (
                            <div key={day} className="border-l border-[var(--theme-border)]/60" />
                          ))}
                        </div>
                        {stays.map((stay) => {
                          const start = Math.max(0, daysBetween(rackFrom, stay.arrival_date));
                          const endExclusive = Math.min(
                            14,
                            daysBetween(rackFrom, stay.departure_date),
                          );
                          const span = Math.max(1, endExclusive - start);
                          if (endExclusive <= 0 || start >= 14) return null;
                          const color =
                            STATUS_COLORS[stay.status] || "bg-slate-100 text-slate-800";
                          return (
                            <button
                              key={stay.id}
                              type="button"
                              title={`${stay.guest_name} · ${stay.confirmation_code}`}
                              onClick={() => (stay.status === "booked" ? openEdit(stay) : null)}
                              className={`absolute top-1 bottom-1 overflow-hidden rounded-md px-1 text-left text-[10px] font-semibold leading-tight ${color}`}
                              style={{
                                left: `calc(${(start / 14) * 100}% + 2px)`,
                                width: `calc(${(span / 14) * 100}% - 4px)`,
                              }}
                            >
                              {stay.guest_name}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!activeRooms.length ? (
                <tr>
                  <td colSpan={15} className="theme-subtext px-3 py-8 text-center">
                    No rooms configured.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="theme-subtext px-3 py-2 text-[11px]">
            Bars show overlapping bookings for 14 days. PMS folio stays and Hotel POS prepaid room sales both
            occupy a room — sell a room from only one path at a time.
          </p>
        </div>
      ) : null}

      <FormDrawer
        open={drawer}
        onClose={() => setDrawer(false)}
        title={editingId ? "Edit reservation" : "New reservation"}
      >
        <form className="space-y-3" onSubmit={save}>
          <Field label="Guest name">
            <input
              required
              className={inputClassName()}
              value={form.guest_name}
              onChange={(e) => setForm((f) => ({ ...f, guest_name: e.target.value }))}
            />
          </Field>
          <Field label="Phone">
            <input
              className={inputClassName()}
              value={form.guest_phone}
              onChange={(e) => setForm((f) => ({ ...f, guest_phone: e.target.value }))}
            />
          </Field>
          <Field label="Room type">
            <SearchableSelect
              required
              className={inputClassName()}
              value={form.room_type_id}
              onChange={(v) => setForm((f) => ({ ...f, room_type_id: v, room_id: "", rate_plan_id: "" }))}
              options={[
                { value: "", label: "Select…" },
                ...roomTypes.map((t) => ({ value: String(t.id), label: t.name || t.code })),
              ]}
            />
          </Field>
          <Field label="Room (optional)">
            <SearchableSelect
              className={inputClassName()}
              value={form.room_id}
              onChange={(v) => setForm((f) => ({ ...f, room_id: v }))}
              options={[
                { value: "", label: "Unassigned" },
                ...roomsForType.map((r) => ({
                  value: String(r.id),
                  label: `${r.room_number} (${r.status})`,
                })),
              ]}
            />
          </Field>
          <Field label="Rate plan">
            <SearchableSelect
              className={inputClassName()}
              value={form.rate_plan_id}
              onChange={(v) => setForm((f) => ({ ...f, rate_plan_id: v }))}
              options={[
                { value: "", label: "Default / room type rate" },
                ...plansForType.map((p) => ({
                  value: String(p.id),
                  label: `${p.name || p.code} · ${Number(p.amount).toFixed(2)}`,
                })),
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Arrival">
              <input
                required
                type="date"
                className={inputClassName()}
                value={form.arrival_date}
                onChange={(e) => setForm((f) => ({ ...f, arrival_date: e.target.value }))}
              />
            </Field>
            <Field label="Departure">
              <input
                required
                type="date"
                className={inputClassName()}
                value={form.departure_date}
                onChange={(e) => setForm((f) => ({ ...f, departure_date: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Deposit">
              <input
                type="number"
                min="0"
                step="any"
                className={inputClassName()}
                value={form.deposit_amount}
                onChange={(e) => setForm((f) => ({ ...f, deposit_amount: e.target.value }))}
              />
            </Field>
            <Field label="Adults">
              <input
                type="number"
                min="1"
                className={inputClassName()}
                value={form.adults}
                onChange={(e) => setForm((f) => ({ ...f, adults: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Notes">
            <textarea
              className={inputClassName()}
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </Field>
          <PrimaryButton showIcon={false} type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </PrimaryButton>
        </form>
      </FormDrawer>
    </CatalogPageShell>
  );
}
