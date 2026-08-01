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
  inputClassName,
  PrimaryButton,
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
  const [rows, setRows] = useState([]);
  const [roomTypes, setRoomTypes] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [ratePlans, setRatePlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("booked");
  const [q, setQ] = useState("");
  const [drawer, setDrawer] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

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

  useTabAwareDataLoad(load);

  const roomsForType = useMemo(
    () => rooms.filter((r) => String(r.room_type_id) === String(form.room_type_id)),
    [rooms, form.room_type_id],
  );
  const plansForType = useMemo(
    () => ratePlans.filter((p) => String(p.room_type_id) === String(form.room_type_id)),
    [ratePlans, form.room_type_id],
  );

  function openCreate() {
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
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
      await load();
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
      await load();
    } catch (e) {
      notifyError(e instanceof ApiError ? e.message : "Update failed");
    }
  }

  return (
    <CatalogPageShell
      title="Reservations"
      subtitle="Book rooms, track arrivals, and prepare for front-desk check-in."
      action={
        <PrimaryButton showIcon onClick={openCreate}>
          New reservation
        </PrimaryButton>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <select className={inputClassName()} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          <option value="booked">Booked</option>
          <option value="checked_in">Checked in</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No-show</option>
        </select>
        <input
          className={`${inputClassName()} w-72 sm:w-96`}
          placeholder="Search guest / code…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <SecondaryButton onClick={() => void load()}>Refresh</SecondaryButton>
      </div>

      {loading ? (
        <p className="theme-subtext text-sm">Loading…</p>
      ) : (
        <div className={TABLE_SHELL_CLASS}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th className="px-3 py-2 text-left">Code</th>
                <th className="px-3 py-2 text-left">Guest</th>
                <th className="px-3 py-2 text-left">Type / Room</th>
                <th className="px-3 py-2 text-left">Dates</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={TABLE_BODY_ROW_CLASS}>
                  <td className="px-3 py-2 font-medium">{row.confirmation_code}</td>
                  <td className="px-3 py-2">
                    {row.guest_name}
                    {row.guest_phone ? (
                      <span className="theme-subtext block text-xs">{row.guest_phone}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    {row.room_type_name || "—"}
                    {row.room_number ? ` · ${row.room_number}` : ""}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {row.arrival_date} → {row.departure_date}
                  </td>
                  <td className="px-3 py-2 capitalize">{row.status?.replace("_", " ")}</td>
                  <td className="px-3 py-2">
                    {row.status === "booked" ? (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="text-xs font-semibold underline" onClick={() => openEdit(row)}>
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-red-600"
                          onClick={() => void setResStatus(row.id, "cancelled")}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className="text-xs font-semibold text-amber-700"
                          onClick={() => void setResStatus(row.id, "no_show")}
                        >
                          No-show
                        </button>
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td colSpan={6} className="theme-subtext px-3 py-8 text-center">
                    No reservations found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}

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
            <select
              required
              className={inputClassName()}
              value={form.room_type_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, room_type_id: e.target.value, room_id: "", rate_plan_id: "" }))
              }
            >
              <option value="">Select…</option>
              {roomTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Room (optional)">
            <select
              className={inputClassName()}
              value={form.room_id}
              onChange={(e) => setForm((f) => ({ ...f, room_id: e.target.value }))}
            >
              <option value="">Unassigned</option>
              {roomsForType.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.room_number} ({r.status})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rate plan (optional)">
            <select
              className={inputClassName()}
              value={form.rate_plan_id}
              onChange={(e) => setForm((f) => ({ ...f, rate_plan_id: e.target.value }))}
            >
              <option value="">Room type base rate</option>
              {plansForType.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {p.amount}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Arrival">
              <input
                type="date"
                required
                className={inputClassName()}
                value={form.arrival_date}
                onChange={(e) => setForm((f) => ({ ...f, arrival_date: e.target.value }))}
              />
            </Field>
            <Field label="Departure">
              <input
                type="date"
                required
                className={inputClassName()}
                value={form.departure_date}
                onChange={(e) => setForm((f) => ({ ...f, departure_date: e.target.value }))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Adults">
              <input
                type="number"
                min="1"
                className={inputClassName()}
                value={form.adults}
                onChange={(e) => setForm((f) => ({ ...f, adults: e.target.value }))}
              />
            </Field>
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
          </div>
          <Field label="Notes">
            <input
              className={inputClassName()}
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
