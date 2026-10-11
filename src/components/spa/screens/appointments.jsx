"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppNavLink } from "@/components/layout/app-nav-link";
import { RecordFormActions, RecordFormPage, useRecordExit } from "@/components/record-form-page";
import { toast } from "@/lib/toast";
import { datePart, formatLong, formatTime, minutesOf, todayISO } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { useAppRouter } from "@/lib/use-app-router";
import { Badge, Button, Empty, Field, SpaContextMenu, SpaFilters, SpaSelect, inputClass, primaryLinkClass, textAreaClass, toolbarControlClass } from "@/components/spa/ui";

const START = 8 * 60;
const END = 19 * 60;
const DAY_HOURS = (END - START) / 60;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function bookingHref(draft) {
  if (draft.id) return `/spa/appointments/${encodeURIComponent(draft.id)}/edit`;
  const query = new URLSearchParams();
  if (draft.start) query.set("start", draft.start);
  if (draft.staffId) query.set("staff", draft.staffId);
  const suffix = query.toString();
  return suffix ? `/spa/appointments/new?${suffix}` : "/spa/appointments/new";
}

export function AppointmentsScreen() {
  const spa = useSpa();
  const params = useSearchParams();
  const router = useAppRouter();
  const [view, setView] = useState("day");
  const [date, setDate] = useState(todayISO());
  const [menu, setMenu] = useState(null);
  const [hourPx, setHourPx] = useState(40);
  const frameRef = useRef(null);
  const laneRef = useRef(null);
  const dayClick = useRef(null);
  const visible = spa.appointments.filter((item) => item.status !== "cancelled");

  useEffect(() => {
    if (params.get("new") === "1") router.replace("/spa/appointments/new");
  }, [params, router]);

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

  const period = view === "month" ? days.filter((iso) => iso.slice(0, 7) === date.slice(0, 7)) : days;
  const periodItems = visible.filter((item) => period.includes(datePart(item.start)));
  const counts = {
    booked: periodItems.filter((item) => item.status === "booked").length,
    in_progress: periodItems.filter((item) => item.status === "in_progress").length,
    completed: periodItems.filter((item) => item.status === "completed").length,
  };
  const nowTop = nowOffset(view === "month" ? "" : view === "week" ? (days.includes(todayISO()) ? todayISO() : "") : date, hourPx);
  const columns = view === "week" ? days : spa.staff;
  const columnCount = Math.max(columns.length, 1);

  useLayoutEffect(() => {
    const node = frameRef.current;
    const scroller = scrollParent(node);
    if (!node || !scroller) return undefined;
    const fit = () => {
      const style = window.getComputedStyle(scroller);
      const available = scroller.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0);
      if (available > 160) node.style.height = `${Math.floor(available)}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const node = laneRef.current;
    if (!node || view === "month") return undefined;
    const measure = () => {
      const next = Math.round((node.clientHeight / DAY_HOURS) * 10) / 10;
      if (next > 8) setHourPx((current) => (current === next ? current : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [view, date, columnCount]);

  return (
    <div ref={frameRef} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="mb-2 flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="theme-heading text-xl font-medium">Appointments</h1>
          <p className="theme-subtext truncate text-sm">{periodTitle(view, date, days)} · {spa.branch}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="theme-panel flex rounded-lg p-1 shadow-sm">
            {["day", "week", "month"].map((option) => (
              <button key={option} type="button" className={`rounded-md px-2.5 py-1.5 text-sm capitalize sm:px-3 ${view === option ? "bg-[var(--theme-primary)] text-white" : "theme-subtext"}`} onClick={() => setView(option)}>{option}</button>
            ))}
          </div>
          <AppNavLink href="/spa/appointments/new" className={primaryLinkClass}>New appointment</AppNavLink>
        </div>
      </div>
      <div className="shrink-0">
      <SpaFilters>
        <button type="button" className="theme-secondary-btn h-[38px] rounded-lg px-3 text-sm" onClick={() => setDate((current) => shiftDate(current, view, -1))}>Previous</button>
        <input type="date" className={toolbarControlClass} value={date} aria-label="Calendar date" onChange={(event) => setDate(event.target.value)} />
        <button type="button" className="theme-secondary-btn h-[38px] rounded-lg px-3 text-sm" onClick={() => setDate((current) => shiftDate(current, view, 1))}>Next</button>
        <button type="button" className="theme-secondary-btn h-[38px] rounded-lg px-3 text-sm" onClick={() => setDate(todayISO())}>Today</button>
      </SpaFilters>
      </div>
      <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2">
        <CountChip label="Booked" value={counts.booked} />
        <CountChip label="In progress" value={counts.in_progress} />
        <CountChip label="Completed" value={counts.completed} />
        <span className="theme-subtext hidden self-center text-xs sm:inline">Double-click or right-click an open time to book.</span>
      </div>

      {view === "month" ? (
        <MonthBoard
          days={days}
          month={date.slice(0, 7)}
          selected={date}
          appointments={visible}
          staff={spa.staff}
          clients={spa.clients}
          onOpen={(iso) => {
            window.clearTimeout(dayClick.current);
            dayClick.current = window.setTimeout(() => {
              setDate(iso);
              setView("day");
            }, 220);
          }}
          onCreate={(iso, event) => {
            event.preventDefault();
            event.stopPropagation();
            window.clearTimeout(dayClick.current);
            router.push(bookingHref(blank(iso)));
          }}
          onMenu={(iso, event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY, items: [{ label: "New appointment", onSelect: () => router.push(bookingHref(blank(iso))) }] });
          }}
        />
      ) : (
        <div className="theme-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border shadow-sm">
          <div className="grid shrink-0" style={{ gridTemplateColumns: `2.5rem repeat(${columnCount}, minmax(0, 1fr))` }}>
            <div className="border-b border-[var(--theme-border)]" />
            {columns.map((item) => (
              <BoardHead key={typeof item === "string" ? item : item.id} column={item} count={periodItems.filter((row) => view === "week" ? datePart(row.start) === item : row.staffId === item.id).length} />
            ))}
          </div>
          <div ref={laneRef} className="min-h-0 flex-1 overflow-hidden">
            <div className="grid h-full" style={{ gridTemplateColumns: `2.5rem repeat(${columnCount}, minmax(0, 1fr))` }}>
              <div className="relative h-full bg-[var(--theme-surface-muted)]">
                {guideMarks(hourPx).filter((mark) => mark.major && mark.top < hourPx * DAY_HOURS - 8).map((mark) => (
                  <div key={mark.top} className="theme-subtext absolute right-1 text-[10px] tabular-nums" style={{ top: mark.top + 2 }}>{mark.label}</div>
                ))}
                {nowTop != null ? <div className="absolute right-1 z-10 -translate-y-1/2 rounded-full bg-rose-500 px-1 py-0.5 text-[9px] font-medium text-white" style={{ top: nowTop }}>Now</div> : null}
              </div>
              {columns.map((column) => (
                <ScheduleColumn
                  key={typeof column === "string" ? column : column.id}
                  column={column}
                  view={view}
                  date={date}
                  hour={hourPx}
                  items={visible.filter((item) => view === "week" ? datePart(item.start) === column : item.staffId === column.id && datePart(item.start) === date)}
                  nowTop={nowTop}
                  clients={spa.clients}
                  services={spa.services}
                  staff={spa.staff}
                  onBook={(draft) => router.push(bookingHref(draft))}
                  onEdit={(item) => router.push(bookingHref(item))}
                  onCancel={(item) => { spa.setAppointmentStatus(item.id, "cancelled"); toast.success("Appointment cancelled."); }}
                  onMenu={(event, items) => setMenu({ x: event.clientX, y: event.clientY, items })}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <SpaContextMenu menu={menu} onClose={() => setMenu(null)} items={menu?.items ?? []} />
    </div>
  );
}

function ScheduleColumn({ column, view, date, hour, items, nowTop, clients, services, staff, onBook, onEdit, onCancel, onMenu }) {
  return (
    <div
      className="relative h-full min-h-0 overflow-hidden border-l border-[var(--theme-border)] bg-[var(--theme-surface)]"
      onDoubleClick={(event) => {
        if (event.target.closest("[data-appointment]")) return;
        onBook(slotFromClick(event, column, view, date, hour));
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        const booking = event.target.closest("[data-appointment]");
        if (booking) {
          const item = items.find((row) => row.id === booking.getAttribute("data-appointment"));
          if (!item) return;
          onMenu(event, [
            { label: "Edit appointment", onSelect: () => onEdit(item) },
            { label: "Cancel booking", onSelect: () => onCancel(item) },
          ]);
          return;
        }
        const draft = slotFromClick(event, column, view, date, hour);
        onMenu(event, [{ label: "New appointment", onSelect: () => onBook(draft) }]);
      }}
    >
      {guideMarks(hour).map((mark) => (
        <div key={mark.top} className={`pointer-events-none absolute inset-x-0 border-t border-[var(--theme-border)] ${mark.major ? "" : "border-dashed opacity-50"}`} style={{ top: mark.top }} />
      ))}
      {nowTop != null && (view === "week" ? column === todayISO() : true) ? <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-rose-500" style={{ top: nowTop }} /> : null}
      {items.map((item) => (
        <AppointmentCard
          key={item.id}
          item={item}
          hour={hour}
          client={clients.find((row) => row.id === item.clientId)}
          service={services.find((row) => row.id === item.serviceId)}
          color={staff.find((row) => row.id === item.staffId)?.color || "#DBEAFE"}
          onOpen={() => onEdit(item)}
        />
      ))}
    </div>
  );
}

function CountChip({ label, value }) {
  return (
    <span className="theme-panel inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm shadow-sm">
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="theme-subtext">{label}</span>
    </span>
  );
}

function BoardHead({ column, count }) {
  if (typeof column === "string") {
    const today = column === todayISO();
    const day = new Date(`${column}T12:00:00`);
    return (
      <div className={`border-b border-l border-[var(--theme-border)] px-1 py-1.5 text-center ${today ? "bg-[color-mix(in_srgb,var(--theme-primary)_8%,transparent)]" : ""}`}>
        <p className={`truncate text-[11px] font-semibold ${today ? "text-[var(--theme-accent-text)]" : ""}`}>{day.toLocaleDateString("en-KE", { weekday: "short" })} {day.getDate()}</p>
        <p className="theme-subtext truncate text-[10px]">{count}</p>
      </div>
    );
  }
  return (
    <div className="border-b border-l border-[var(--theme-border)] px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: column.color || "#93C5FD" }} />
        <span className="truncate text-xs font-semibold sm:text-sm">{column.name}</span>
      </div>
      <p className="theme-subtext mt-0.5 truncate text-[10px] sm:text-xs">{count}</p>
    </div>
  );
}

function AppointmentCard({ item, client, service, color, hour, onOpen }) {
  const top = ((minutesOf(item.start) - START) / 60) * hour;
  const height = Math.max(Math.min(16, hour * 0.45), (item.duration / 60) * hour - 2);
  const quiet = item.status === "completed" || item.status === "no_show";
  return (
    <button
      type="button"
      data-appointment={item.id}
      className="absolute inset-x-0.5 z-[1] overflow-hidden rounded-md px-1 py-0.5 text-left text-slate-900 shadow-sm ring-1 ring-black/5 sm:inset-x-1"
      style={{
        top: top + 3,
        height,
        background: color,
        borderLeft: `3px solid color-mix(in srgb, ${color} 35%, #1e293b)`,
        opacity: quiet ? 0.7 : 1,
      }}
      onClick={onOpen}
      onDoubleClick={(event) => { event.stopPropagation(); onOpen(); }}
    >
      <p className="truncate text-xs font-semibold leading-4">{client?.name || "Client"}</p>
      {height >= 40 ? (
        <p className="truncate text-[11px] leading-4 text-slate-700">
          {service?.name || "Service"}{height < 62 ? ` · ${formatTime(item.start)}` : ""}
        </p>
      ) : null}
      {height >= 62 ? <p className="truncate text-[10px] leading-4 text-slate-600">{formatTime(item.start)} · {statusLabel(item.status)}</p> : null}
    </button>
  );
}

function MonthBoard({ days, month, selected, appointments, staff, clients, onOpen, onCreate, onMenu }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="mb-1 grid shrink-0 grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide sm:text-[11px]">
        {WEEKDAYS.map((day) => <div key={day} className="theme-subtext">{day}</div>)}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-6 gap-1">
        {days.map((iso) => {
          const items = appointments.filter((item) => datePart(item.start) === iso);
          const outside = iso.slice(0, 7) !== month;
          const today = iso === todayISO();
          return (
            <button
              key={iso}
              type="button"
              className={`theme-panel h-full min-h-0 overflow-hidden rounded-lg border p-1 text-left ${iso === selected ? "border-[var(--theme-primary)]" : ""} ${outside ? "opacity-45" : ""}`}
              onClick={() => onOpen(iso)}
              onDoubleClick={(event) => onCreate(iso, event)}
              onContextMenu={(event) => onMenu(iso, event)}
            >
              <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-semibold ${today ? "bg-[var(--theme-primary)] text-white" : ""}`}>{Number(iso.slice(8))}</span>
              {items.length > 0 ? <span className="theme-subtext mt-1 block text-[10px] font-medium sm:hidden">{items.length}</span> : null}
              <span className="mt-1 hidden space-y-1 sm:block">
                {items.slice(0, 3).map((item) => {
                  const color = staff.find((row) => row.id === item.staffId)?.color || "#DBEAFE";
                  const name = clients.find((row) => row.id === item.clientId)?.name || "Client";
                  return (
                    <span key={item.id} className="block truncate rounded px-1 py-0.5 text-[10px] text-slate-900" style={{ background: color }}>
                      {String(item.start).slice(11, 16)} {name.split(" ")[0]}
                    </span>
                  );
                })}
                {items.length > 3 ? <span className="theme-subtext block text-[10px]">+{items.length - 3} more</span> : null}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function scrollParent(node) {
  let current = node?.parentElement;
  while (current) {
    const overflow = window.getComputedStyle(current).overflowY;
    if (overflow === "auto" || overflow === "scroll") return current;
    current = current.parentElement;
  }
  return node?.parentElement ?? null;
}

function compactHour(hour) {
  const suffix = hour >= 12 ? "p" : "a";
  const face = hour % 12 || 12;
  return `${face}${suffix}`;
}

function guideMarks(hour) {
  const marks = [];
  for (let index = 0; index < DAY_HOURS; index += 1) {
    marks.push({
      top: index * hour,
      major: true,
      label: compactHour(8 + index),
    });
    if (hour >= 36) marks.push({ top: index * hour + hour / 2, major: false, label: "" });
  }
  return marks;
}

function periodTitle(view, date, days) {
  if (view === "week" && days.length > 1) {
    const start = new Date(`${days[0]}T12:00:00`);
    const end = new Date(`${days[days.length - 1]}T12:00:00`);
    const sameMonth = start.getMonth() === end.getMonth();
    const startLabel = sameMonth ? String(start.getDate()) : start.toLocaleDateString("en-KE", { day: "numeric", month: "short" });
    const endLabel = end.toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
    return `${startLabel} – ${endLabel}`;
  }
  if (view === "month") {
    return new Date(`${date}T12:00:00`).toLocaleDateString("en-KE", { month: "long", year: "numeric" });
  }
  return formatLong(date);
}

function nowOffset(iso, hour) {
  if (iso !== todayISO()) return null;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < START || minutes > END) return null;
  return ((minutes - START) / 60) * hour;
}

function shiftDate(iso, view, direction) {
  const next = new Date(`${iso}T12:00:00`);
  if (view === "month") next.setMonth(next.getMonth() + direction);
  else if (view === "week") next.setDate(next.getDate() + direction * 7);
  else next.setDate(next.getDate() + direction);
  return todayISO(next);
}

function statusLabel(value) {
  return String(value || "").replaceAll("_", " ");
}

function blank(date) {
  return { clientId: "", staffId: "", serviceId: "", roomId: "", chairId: "", start: `${date}T09:00`, duration: 30, status: "booked", notes: "" };
}

function slotFromClick(event, column, view, date, hour) {
  const rect = event.currentTarget.getBoundingClientRect();
  const minutes = START + Math.max(0, Math.floor((event.clientY - rect.top) / hour)) * 60;
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

export function AppointmentFormScreen({ id }) {
  const spa = useSpa();
  const params = useSearchParams();
  const existing = id ? spa.appointments.find((item) => item.id === id) : null;
  const title = id ? "Edit appointment" : "New appointment";
  const { exitTo } = useRecordExit(title);
  const [form, setForm] = useState(() => existing || {
    ...blank((params.get("start") || "").slice(0, 10) || todayISO()),
    start: params.get("start") || `${todayISO()}T09:00`,
    staffId: params.get("staff") || "",
  });
  useEffect(() => {
    if (id || existing) return;
    const start = params.get("start");
    const staff = params.get("staff");
    if (!start && !staff) return;
    setForm((current) => {
      if ((!start || current.start === start) && (!staff || current.staffId === staff)) return current;
      return {
        ...current,
        ...(start ? { start } : {}),
        ...(staff ? { staffId: staff } : {}),
      };
    });
  }, [existing, id, params]);
  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  if (id && !existing) return <Empty title="Appointment not found" detail="It may have been cancelled or removed from this browser's sample data." />;
  function save(event) {
    event.preventDefault();
    const error = spa.saveAppointment(form);
    if (error) toast.error(error);
    else {
      toast.success(form.id ? "Appointment updated." : "Appointment booked.");
      exitTo("/spa/appointments");
    }
  }
  return (
    <RecordFormPage title={title} backHref="/spa/appointments" wide>
      <form onSubmit={save}>
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {form.id ? <Button variant="danger" onClick={() => { spa.setAppointmentStatus(form.id, "cancelled"); toast.success("Appointment cancelled."); exitTo("/spa/appointments"); }}>Cancel booking</Button> : <span />}
        <RecordFormActions backHref="/spa/appointments" />
      </div>
      {form.id ? <p className="mt-3 text-xs text-slate-500"><Badge tone="blue">{String(form.status).replace("_", " ")}</Badge> Change the time above to reschedule.</p> : null}
      </form>
    </RecordFormPage>
  );
}

export function WalkInFormScreen() {
  const spa = useSpa();
  const { exitTo } = useRecordExit("Walk-in");
  const [form, setForm] = useState({ name: "", phone: "", serviceId: spa.services[0]?.id || "" });
  function save(event) {
    event.preventDefault();
    const error = spa.addWalkIn(form);
    if (error) toast.error(error);
    else {
      toast.success("Added to the walk-in queue.");
      exitTo("/spa/appointments");
    }
  }
  return (
    <RecordFormPage title="Walk-in" backHref="/spa/appointments">
      <form onSubmit={save}>
      <div className="grid gap-3">
        <Field label="Name"><input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field>
        <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></Field>
        <Field label="Service"><SpaSelect value={form.serviceId} onChange={(event) => setForm({ ...form, serviceId: event.target.value })} options={spa.services.map((item) => ({ value: item.id, label: item.name }))} /></Field>
      </div>
      <RecordFormActions backHref="/spa/appointments" submitLabel="Add to queue" />
      </form>
    </RecordFormPage>
  );
}

