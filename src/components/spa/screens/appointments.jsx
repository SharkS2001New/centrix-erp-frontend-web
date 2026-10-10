"use client";

import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "@/lib/toast";
import { datePart, formatDay, formatTime, minutesOf, todayISO } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { Badge, Button, Field, Modal, PageHeader, SpaContextMenu, SpaSelect, inputClass, textAreaClass, toolbarControlClass } from "@/components/spa/ui";

const START = 8 * 60;
const END = 19 * 60;

export function AppointmentsScreen() {
  const spa = useSpa();
  const params = useSearchParams();
  const [view, setView] = useState("day");
  const [date, setDate] = useState(todayISO());
  const [editing, setEditing] = useState(null);
  const [skipNew, setSkipNew] = useState(false);
  const [walkIn, setWalkIn] = useState(false);
  const [queueStaff, setQueueStaff] = useState({});
  const [menu, setMenu] = useState(null);
  const dayClick = useRef(null);

  const active = editing || (!skipNew && params.get("new") === "1" ? blank(date) : null);
  const visible = spa.appointments.filter((item) => item.status !== "cancelled");

  const days = useMemo(() => {
    const start = new Date(`${date}T12:00:00`);
    if (view === "month") {
      const first = new Date(start.getFullYear(), start.getMonth(), 1);
      const gridStart = new Date(first);
      gridStart.setDate(1 - first.getDay());
      return Array.from({ length: 42 }, (_, index) => {
        const day = new Date(gridStart);
        day.setDate(gridStart.getDate() + index);
        return todayISO(day);
      });
    }
    if (view === "week") {
      const monday = new Date(start);
      const offset = (monday.getDay() + 6) % 7;
      monday.setDate(monday.getDate() - offset);
      return Array.from({ length: 7 }, (_, index) => {
        const day = new Date(monday);
        day.setDate(monday.getDate() + index);
        return todayISO(day);
      });
    }
    return [date];
  }, [date, view]);

  function save(draft) {
    const error = spa.saveAppointment(draft);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success(draft.id ? "Appointment updated." : "Appointment booked.");
    setEditing(null);
    setSkipNew(true);
  }

  return (
    <div>
      <PageHeader title="Appointments" detail={`${spa.branch} calendar. Double-click or right-click a time to book.`}>
        <Field label="Date">
          <input type="date" className={toolbarControlClass} value={date} aria-label="Calendar date" onChange={(event) => setDate(event.target.value)} />
        </Field>
        <div className="theme-panel flex rounded-lg p-1 shadow-sm">
          {["day", "week", "month"].map((option) => (
            <button key={option} type="button" className={`rounded-md px-3 py-1.5 text-sm capitalize ${view === option ? "bg-[var(--theme-primary)] text-white" : "theme-subtext"}`} onClick={() => setView(option)}>{option}</button>
          ))}
        </div>
        <Button onClick={() => setEditing(blank(date))}>New appointment</Button>
      </PageHeader>

      {view === "month" ? (
        <div className="grid grid-cols-7 gap-2">
          {days.map((iso) => {
            const count = visible.filter((item) => datePart(item.start) === iso).length;
            return (
              <button
                key={iso}
                type="button"
                className={`theme-panel min-h-20 rounded-xl border p-2 text-left text-xs ${iso === date ? "border-[var(--theme-primary)]" : ""}`}
                onClick={() => {
                  window.clearTimeout(dayClick.current);
                  dayClick.current = window.setTimeout(() => {
                    setDate(iso);
                    setView("day");
                  }, 220);
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  window.clearTimeout(dayClick.current);
                  setEditing(blank(iso));
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ x: event.clientX, y: event.clientY, items: [{ label: "New appointment", onSelect: () => setEditing(blank(iso)) }] });
                }}
              >
                <span className="font-medium">{formatDay(iso)}</span>
                {count > 0 ? <p className="mt-2 text-[var(--theme-accent-text)]">{count} booked</p> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="theme-panel overflow-x-auto rounded-xl border shadow-sm">
          <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `4.5rem repeat(${view === "week" ? 7 : spa.staff.length}, minmax(8rem, 1fr))` }}>
            <div />
            {(view === "week" ? days : spa.staff).map((item) => (
              <div key={typeof item === "string" ? item : item.id} className="border-b border-l border-slate-100 px-2 py-3 text-sm font-medium">
                {typeof item === "string" ? formatDay(item) : item.name}
              </div>
            ))}
            <div className="relative" style={{ height: ((END - START) / 60) * 48 }}>
              {Array.from({ length: (END - START) / 60 + 1 }, (_, index) => (
                <div key={index} className="absolute left-0 right-0 border-t border-slate-100 text-[10px] text-slate-400" style={{ top: index * 48 }}>{`${8 + index}:00`}</div>
              ))}
            </div>
            {(view === "week" ? days : spa.staff).map((column) => (
              <div
                key={typeof column === "string" ? column : column.id}
                className="relative border-l border-[var(--theme-border)]"
                style={{ height: ((END - START) / 60) * 48 }}
                onDoubleClick={(event) => {
                  if (event.target.closest("[data-appointment]")) return;
                  setEditing(slotFromClick(event, column, view, date));
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  const booking = event.target.closest("[data-appointment]");
                  if (booking) {
                    const item = visible.find((row) => row.id === booking.getAttribute("data-appointment"));
                    if (!item) return;
                    setMenu({
                      x: event.clientX,
                      y: event.clientY,
                      items: [
                        { label: "Edit appointment", onSelect: () => setEditing(item) },
                        { label: "Cancel booking", onSelect: () => { spa.setAppointmentStatus(item.id, "cancelled"); toast.success("Appointment cancelled."); } },
                      ],
                    });
                    return;
                  }
                  const draft = slotFromClick(event, column, view, date);
                  setMenu({
                    x: event.clientX,
                    y: event.clientY,
                    items: [{ label: "New appointment", onSelect: () => setEditing(draft) }],
                  });
                }}
              >
                {visible.filter((item) => view === "week" ? datePart(item.start) === column : item.staffId === column.id && datePart(item.start) === date).map((item) => {
                  const top = ((minutesOf(item.start) - START) / 60) * 48;
                  const height = Math.max(28, (item.duration / 60) * 48);
                  const client = spa.clients.find((row) => row.id === item.clientId);
                  const service = spa.services.find((row) => row.id === item.serviceId);
                  const color = spa.staff.find((row) => row.id === item.staffId)?.color || "#DBEAFE";
                  return (
                    <button key={item.id} type="button" data-appointment={item.id} className="absolute inset-x-1 overflow-hidden rounded-lg px-2 py-1 text-left text-xs" style={{ top, height, background: color }} onClick={() => setEditing(item)} onDoubleClick={(event) => { event.stopPropagation(); setEditing(item); }}>
                      <p className="font-semibold">{client?.name}</p>
                      <p>{service?.name}</p>
                      <p>{formatTime(item.start)}</p>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="theme-panel rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Walk-in queue</h2>
          {spa.walkIns.filter((item) => item.status === "waiting").length === 0 ? <p className="mt-3 text-sm text-slate-500">No one is waiting.</p> : (
            <ul className="mt-3 space-y-3">
              {spa.walkIns.filter((item) => item.status === "waiting").map((guest) => (
                <li key={guest.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <div>
                    <p className="font-medium">{guest.name}</p>
                    <p className="text-xs text-slate-500">{spa.services.find((item) => item.id === guest.serviceId)?.name || "Any service"}</p>
                  </div>
                  <div className="flex gap-2">
                    <SpaSelect toolbar aria-label={`Staff for ${guest.name}`} placeholder="Assign" value={queueStaff[guest.id]?.staffId || ""} onChange={(event) => setQueueStaff((current) => ({ ...current, [guest.id]: { ...current[guest.id], staffId: event.target.value } }))} options={[{ value: "", label: "Assign" }, ...spa.staff.filter((item) => item.active).map((item) => ({ value: item.id, label: item.name }))]} />
                    {spa.features.chairs ? (
                      <SpaSelect toolbar aria-label={`Chair for ${guest.name}`} placeholder="Chair" value={queueStaff[guest.id]?.chairId || ""} onChange={(event) => setQueueStaff((current) => ({ ...current, [guest.id]: { ...current[guest.id], chairId: event.target.value } }))} options={[{ value: "", label: "Chair" }, ...spa.chairs.map((chair) => ({ value: chair.id, label: chair.name }))]} />
                    ) : null}
                    <Button onClick={() => {
                      const error = spa.seatWalkIn(guest.id, queueStaff[guest.id]?.staffId, queueStaff[guest.id]?.chairId);
                      if (error) toast.error(error);
                      else toast.success(`${guest.name} is seated.`);
                    }}>Seat</Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="theme-panel rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Add a walk-in</h2>
          <Button className="mt-3" variant="ghost" onClick={() => setWalkIn(true)}>Quick booking</Button>
          {spa.features.rooms ? <p className="mt-4 text-xs text-slate-500">Treatment rooms: {spa.rooms.map((room) => room.name).join(", ")}</p> : null}
          {spa.features.chairs ? <p className="mt-2 text-xs text-slate-500">Chairs open: {spa.chairs.length}</p> : null}
        </div>
      </section>

      <SpaContextMenu menu={menu} onClose={() => setMenu(null)} items={menu?.items ?? []} />
      {active ? <BookingModal spa={spa} draft={active} onClose={() => { setEditing(null); setSkipNew(true); }} onSave={save} /> : null}
      {walkIn ? <WalkInModal onClose={() => setWalkIn(false)} onSave={(draft) => {
        const error = spa.addWalkIn(draft);
        if (error) toast.error(error);
        else { toast.success("Added to the walk-in queue."); setWalkIn(false); }
      }} services={spa.services} /> : null}
    </div>
  );
}

function blank(date) {
  return { clientId: "", staffId: "", serviceId: "", roomId: "", chairId: "", start: `${date}T09:00`, duration: 30, status: "booked", notes: "" };
}

function slotFromClick(event, column, view, date) {
  const rect = event.currentTarget.getBoundingClientRect();
  const minutes = START + Math.max(0, Math.floor((event.clientY - rect.top) / 48)) * 60;
  const clamped = Math.min(END - 30, Math.max(START, minutes));
  const hours = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mins = String(clamped % 60).padStart(2, "0");
  const day = view === "week" ? column : date;
  return {
    ...blank(day),
    staffId: view === "week" ? "" : column.id,
    start: `${day}T${hours}:${mins}`,
  };
}

function BookingModal({ spa, draft, onClose, onSave }) {
  const [form, setForm] = useState(draft);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  return (
    <Modal title={form.id ? "Edit appointment" : "New appointment"} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Client"><SpaSelect value={form.clientId} onChange={set("clientId")} placeholder="Select" options={[{ value: "", label: "Select" }, ...spa.clients.map((item) => ({ value: item.id, label: item.name }))]} /></Field>
        <Field label="Service"><SpaSelect value={form.serviceId} placeholder="Select" onChange={(event) => {
          const service = spa.services.find((item) => item.id === event.target.value);
          setForm((current) => ({ ...current, serviceId: event.target.value, duration: service?.duration || current.duration }));
        }} options={[{ value: "", label: "Select" }, ...spa.services.filter((item) => item.active).map((item) => ({ value: item.id, label: item.name }))]} /></Field>
        <Field label="Staff"><SpaSelect value={form.staffId} onChange={set("staffId")} placeholder="Select" options={[{ value: "", label: "Select" }, ...spa.staff.map((item) => ({ value: item.id, label: item.name }))]} /></Field>
        <Field label="Starts"><input className={inputClass} type="datetime-local" value={String(form.start).slice(0, 16)} onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))} /></Field>
        <Field label="Duration (minutes)"><input className={inputClass} type="number" min="10" value={form.duration} onChange={set("duration")} /></Field>
        <Field label="Status"><SpaSelect value={form.status} onChange={set("status")} options={[{ value: "booked", label: "Booked" }, { value: "in_progress", label: "In progress" }, { value: "completed", label: "Completed" }, { value: "no_show", label: "No show" }]} /></Field>
        {spa.features.rooms ? <Field label="Treatment room"><SpaSelect value={form.roomId} onChange={set("roomId")} placeholder="None" options={[{ value: "", label: "None" }, ...spa.rooms.map((room) => ({ value: room.id, label: room.name }))]} /></Field> : null}
        {spa.features.chairs ? <Field label="Chair"><SpaSelect value={form.chairId} onChange={set("chairId")} placeholder="None" options={[{ value: "", label: "None" }, ...spa.chairs.map((chair) => ({ value: chair.id, label: chair.name }))]} /></Field> : null}
      </div>
      <Field label="Notes"><textarea className={`${textAreaClass} mt-3`} rows={2} value={form.notes} onChange={set("notes")} /></Field>
      <div className="mt-4 flex flex-wrap justify-between gap-2">
        {form.id ? <Button variant="danger" onClick={() => { spa.setAppointmentStatus(form.id, "cancelled"); toast.success("Appointment cancelled."); onClose(); }}>Cancel booking</Button> : <span />}
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button onClick={() => onSave(form)}>Save</Button>
        </div>
      </div>
      {form.id ? <p className="mt-3 text-xs text-slate-500"><Badge tone="blue">{form.status.replace("_", " ")}</Badge> Change the time above to reschedule.</p> : null}
    </Modal>
  );
}

function WalkInModal({ services, onClose, onSave }) {
  const [form, setForm] = useState({ name: "", phone: "", serviceId: services[0]?.id || "" });
  return (
    <Modal title="Walk-in" onClose={onClose}>
      <div className="grid gap-3">
        <Field label="Name"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
        <Field label="Service"><SpaSelect value={form.serviceId} onChange={(event) => setForm({ ...form, serviceId: event.target.value })} options={services.map((item) => ({ value: item.id, label: item.name }))} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Close</Button>
        <Button onClick={() => onSave(form)}>Add to queue</Button>
      </div>
    </Modal>
  );
}
