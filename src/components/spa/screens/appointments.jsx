"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AppNavLink } from "@/components/layout/app-nav-link";
import { RecordFormActions, RecordFormPage, useRecordExit } from "@/components/record-form-page";
import { toast } from "@/lib/toast";
import { datePart, formatLong, formatTime, minutesOf, todayISO } from "@/lib/spa/format";
import { useSpa } from "@/lib/spa/store";
import { useAppRouter } from "@/lib/use-app-router";
import { Badge, Button, Empty, Field, PageHeader, SpaContextMenu, SpaFilters, SpaSelect, inputClass, primaryLinkClass, textAreaClass, toolbarControlClass } from "@/components/spa/ui";

const HOUR = 96;
const START = 8 * 60;
const END = 19 * 60;
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
  const [queueStaff, setQueueStaff] = useState({});
  const [menu, setMenu] = useState(null);
  const [focusStaff, setFocusStaff] = useState("");
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
  const nowTop = nowOffset(view === "month" ? "" : view === "week" ? (days.includes(todayISO()) ? todayISO() : "") : date);
  const boardHeight = ((END - START) / 60) * HOUR;
  const phoneStaff = spa.staff.find((item) => item.id === focusStaff) || spa.staff[0] || null;

  return (
    <div>
      <PageHeader title="Appointments" detail={`${periodTitle(view, date, days)} · ${spa.branch}`}>
        <div className="theme-panel flex rounded-lg p-1 shadow-sm">
          {["day", "week", "month"].map((option) => (
            <button key={option} type="button" className={`rounded-md px-2.5 py-1.5 text-sm capitalize sm:px-3 ${view === option ? "bg-[var(--theme-primary)] text-white" : "theme-subtext"}`} onClick={() => setView(option)}>{option}</button>
          ))}
        </div>
        <AppNavLink href="/spa/appointments/new" className={primaryLinkClass}>New appointment</AppNavLink>
      </PageHeader>
      <SpaFilters>
        <button type="button" className="theme-secondary-btn h-[38px] rounded-lg px-3 text-sm" onClick={() => setDate((current) => shiftDate(current, view, -1))}>Previous</button>
        <input type="date" className={toolbarControlClass} value={date} aria-label="Calendar date" onChange={(event) => setDate(event.target.value)} />
        <button type="button" className="theme-secondary-btn h-[38px] rounded-lg px-3 text-sm" onClick={() => setDate((current) => shiftDate(current, view, 1))}>Next</button>
        <button type="button" className="theme-secondary-btn h-[38px] rounded-lg px-3 text-sm" onClick={() => setDate(todayISO())}>Today</button>
      </SpaFilters>
      <div className="mb-4 flex flex-wrap gap-2">
        <CountChip label="Booked" value={counts.booked} />
        <CountChip label="In progress" value={counts.in_progress} />
        <CountChip label="Completed" value={counts.completed} />
        <span className="theme-subtext self-center text-xs">Double-click or right-click an open time to book.</span>
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
        <>
        <div className="md:hidden">
          {view === "week" ? (
            <div className="space-y-3">
              {days.map((iso) => {
                const items = visible.filter((item) => datePart(item.start) === iso);
                const day = new Date(`${iso}T12:00:00`);
                return (
                  <section key={iso} className="theme-panel rounded-2xl border p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-2">
                      <h2 className={`text-sm font-semibold ${iso === todayISO() ? "text-[var(--theme-accent-text)]" : ""}`}>{day.toLocaleDateString("en-KE", { weekday: "short", day: "numeric", month: "short" })}</h2>
                      <button type="button" className="text-sm font-medium text-[var(--theme-accent-text)]" onClick={() => router.push(bookingHref(blank(iso)))}>Book</button>
                    </div>
                    {items.length === 0 ? <p className="theme-subtext mt-2 text-sm">Open</p> : (
                      <ul className="mt-2 space-y-2">
                        {items.map((item) => {
                          const client = spa.clients.find((row) => row.id === item.clientId);
                          const service = spa.services.find((row) => row.id === item.serviceId);
                          const color = spa.staff.find((row) => row.id === item.staffId)?.color || "#DBEAFE";
                          return (
                            <li key={item.id}>
                              <button type="button" className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-slate-900" style={{ background: color }} onClick={() => router.push(bookingHref(item))}>
                                <span className="w-16 shrink-0 text-xs font-medium">{formatTime(item.start)}</span>
                                <span className="min-w-0">
                                  <span className="block truncate font-semibold">{client?.name || "Client"}</span>
                                  <span className="block truncate text-xs text-slate-700">{service?.name} · {statusLabel(item.status)}</span>
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          ) : phoneStaff ? (
            <div className="theme-panel overflow-hidden rounded-2xl border shadow-sm">
              <div className="flex gap-2 overflow-x-auto border-b border-[var(--theme-border)] p-2">
                {spa.staff.map((person) => (
                  <button key={person.id} type="button" className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${person.id === phoneStaff.id ? "bg-[var(--theme-primary)] text-white" : "theme-secondary-btn"}`} onClick={() => setFocusStaff(person.id)}>{person.name.split(" ")[0]}</button>
                ))}
              </div>
              <div className="grid" style={{ gridTemplateColumns: "3.25rem minmax(0,1fr)" }}>
                <div className="relative bg-[var(--theme-surface-muted)]" style={{ height: boardHeight }}>
                  {guideMarks().filter((mark) => mark.major && mark.top < boardHeight).map((mark) => (
                    <div key={mark.top} className="theme-subtext absolute right-1 text-[10px] tabular-nums" style={{ top: mark.top + 6 }}>{mark.label}</div>
                  ))}
                </div>
                <ScheduleColumn
                  column={phoneStaff}
                  view="day"
                  date={date}
                  items={visible.filter((item) => item.staffId === phoneStaff.id && datePart(item.start) === date)}
                  nowTop={date === todayISO() ? nowTop : null}
                  boardHeight={boardHeight}
                  clients={spa.clients}
                  services={spa.services}
                  staff={spa.staff}
                  onBook={(draft) => router.push(bookingHref(draft))}
                  onEdit={(item) => router.push(bookingHref(item))}
                  onCancel={(item) => { spa.setAppointmentStatus(item.id, "cancelled"); toast.success("Appointment cancelled."); }}
                  onMenu={(event, items) => setMenu({ x: event.clientX, y: event.clientY, items })}
                />
              </div>
            </div>
          ) : <p className="theme-subtext text-sm">Add staff before booking a chair or room.</p>}
        </div>
        <div className="theme-panel hidden overflow-x-auto rounded-2xl border shadow-sm md:block">
          <div className="grid w-max min-w-full" style={{ gridTemplateColumns: `4.25rem repeat(${view === "week" ? 7 : Math.max(spa.staff.length, 1)}, minmax(8rem, 1fr))` }}>
            <div className="border-b border-[var(--theme-border)]" />
            {(view === "week" ? days : spa.staff).map((item) => (
              <BoardHead key={typeof item === "string" ? item : item.id} column={item} count={periodItems.filter((row) => view === "week" ? datePart(row.start) === item : row.staffId === item.id).length} />
            ))}
            <div className="relative bg-[var(--theme-surface-muted)]" style={{ height: boardHeight }}>
              {guideMarks().filter((mark) => mark.major && mark.top < boardHeight).map((mark) => (
                <div key={mark.top} className="theme-subtext absolute right-2 text-[10px] tabular-nums" style={{ top: mark.top + 6 }}>{mark.label}</div>
              ))}
              {nowTop != null ? <div className="absolute right-2 z-10 -translate-y-1/2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ top: nowTop }}>Now</div> : null}
            </div>
            {(view === "week" ? days : spa.staff).map((column) => (
              <ScheduleColumn
                key={typeof column === "string" ? column : column.id}
                column={column}
                view={view}
                date={date}
                items={visible.filter((item) => view === "week" ? datePart(item.start) === column : item.staffId === column.id && datePart(item.start) === date)}
                nowTop={nowTop}
                boardHeight={boardHeight}
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
        </>
      )}

      <section className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="theme-panel rounded-2xl border p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Walk-in queue</h2>
          {spa.walkIns.filter((item) => item.status === "waiting").length === 0 ? <p className="theme-subtext mt-3 text-sm">No one is waiting.</p> : (
            <ul className="mt-3 divide-y divide-[var(--theme-border)]">
              {spa.walkIns.filter((item) => item.status === "waiting").map((guest) => (
                <li key={guest.id} className="flex flex-col gap-3 py-3 text-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color-mix(in_srgb,var(--theme-primary)_12%,white)] text-sm font-semibold text-[var(--theme-accent-text)]">{initials(guest.name)}</span>
                    <div className="min-w-0">
                      <p className="font-medium">{guest.name}</p>
                      <p className="theme-subtext text-xs">{spa.services.find((item) => item.id === guest.serviceId)?.name || "Any service"} · waiting</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
        <div className="theme-panel rounded-2xl border p-4 shadow-sm">
          <h2 className="text-sm font-semibold">Add a walk-in</h2>
          <p className="theme-subtext mt-1 text-sm">Someone arrived without a booking.</p>
          <AppNavLink href="/spa/appointments/walk-in" className="theme-secondary-btn mt-3 inline-flex items-center justify-center rounded-lg px-3.5 py-2 text-sm font-medium">Quick booking</AppNavLink>
          {spa.features.rooms ? <div className="mt-4 flex flex-wrap gap-1.5">{spa.rooms.map((room) => <span key={room.id} className="theme-subtext rounded-full bg-[var(--theme-surface-muted)] px-2 py-1 text-xs">{room.name}</span>)}</div> : null}
          {spa.features.chairs ? <p className="theme-subtext mt-3 text-xs">{spa.chairs.length} chairs open</p> : null}
        </div>
      </section>

      <SpaContextMenu menu={menu} onClose={() => setMenu(null)} items={menu?.items ?? []} />
    </div>
  );
}

function ScheduleColumn({ column, view, date, items, nowTop, boardHeight, clients, services, staff, onBook, onEdit, onCancel, onMenu }) {
  return (
    <div
      className="relative border-l border-[var(--theme-border)] bg-[var(--theme-surface)]"
      style={{ height: boardHeight }}
      onDoubleClick={(event) => {
        if (event.target.closest("[data-appointment]")) return;
        onBook(slotFromClick(event, column, view, date));
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
        const draft = slotFromClick(event, column, view, date);
        onMenu(event, [{ label: "New appointment", onSelect: () => onBook(draft) }]);
      }}
    >
      {guideMarks().map((mark) => (
        <div key={mark.top} className={`pointer-events-none absolute inset-x-0 border-t border-[var(--theme-border)] ${mark.major ? "" : "border-dashed opacity-50"}`} style={{ top: mark.top }} />
      ))}
      {nowTop != null && (view === "week" ? column === todayISO() : true) ? <div className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-rose-500" style={{ top: nowTop }} /> : null}
      {items.map((item) => (
        <AppointmentCard
          key={item.id}
          item={item}
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
      <div className={`border-b border-l border-[var(--theme-border)] px-2 py-3 text-center ${today ? "bg-[color-mix(in_srgb,var(--theme-primary)_8%,transparent)]" : ""}`}>
        <p className="theme-subtext text-[11px] uppercase tracking-wide">{day.toLocaleDateString("en-KE", { weekday: "short" })}</p>
        <p className={`mx-auto mt-1 grid h-8 w-8 place-items-center rounded-full text-sm font-semibold ${today ? "bg-[var(--theme-primary)] text-white" : ""}`}>{day.getDate()}</p>
        <p className="theme-subtext mt-1 text-[11px]">{countLabel(count)}</p>
      </div>
    );
  }
  return (
    <div className="border-b border-l border-[var(--theme-border)] px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: column.color || "#93C5FD" }} />
        <span className="truncate text-sm font-semibold">{column.name}</span>
      </div>
      <p className="theme-subtext mt-1 truncate text-xs">{column.role} · {countLabel(count)}</p>
    </div>
  );
}

function AppointmentCard({ item, client, service, color, onOpen }) {
  const top = ((minutesOf(item.start) - START) / 60) * HOUR;
  const height = Math.max(34, (item.duration / 60) * HOUR - 6);
  const quiet = item.status === "completed" || item.status === "no_show";
  return (
    <button
      type="button"
      data-appointment={item.id}
      className="absolute inset-x-1.5 z-[1] overflow-hidden rounded-lg px-2 py-0.5 text-left text-slate-900 shadow-sm ring-1 ring-black/5 transition hover:-translate-y-px hover:shadow-md"
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
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wide sm:mb-2 sm:gap-2 sm:text-[11px]">
        {WEEKDAYS.map((day) => <div key={day} className="theme-subtext">{day}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {days.map((iso) => {
          const items = appointments.filter((item) => datePart(item.start) === iso);
          const outside = iso.slice(0, 7) !== month;
          const today = iso === todayISO();
          return (
            <button
              key={iso}
              type="button"
              className={`theme-panel min-h-16 rounded-lg border p-1 text-left sm:min-h-28 sm:rounded-xl sm:p-2 ${iso === selected ? "border-[var(--theme-primary)]" : ""} ${outside ? "opacity-45" : ""}`}
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

function guideMarks() {
  const hours = (END - START) / 60;
  const marks = [];
  for (let index = 0; index <= hours; index += 1) {
    marks.push({
      top: index * HOUR,
      major: true,
      label: formatTime(`${todayISO()}T${String(8 + index).padStart(2, "0")}:00`),
    });
    if (index < hours) marks.push({ top: index * HOUR + HOUR / 2, major: false, label: "" });
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

function countLabel(count) {
  if (!count) return "Open";
  return `${count} appointment${count === 1 ? "" : "s"}`;
}

function nowOffset(iso) {
  if (iso !== todayISO()) return null;
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  if (minutes < START || minutes > END) return null;
  return ((minutes - START) / 60) * HOUR;
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

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).slice(0, 2);
  return parts.map((part) => part.charAt(0).toUpperCase()).join("") || "?";
}

function blank(date) {
  return { clientId: "", staffId: "", serviceId: "", roomId: "", chairId: "", start: `${date}T09:00`, duration: 30, status: "booked", notes: "" };
}

function slotFromClick(event, column, view, date) {
  const rect = event.currentTarget.getBoundingClientRect();
  const minutes = START + Math.max(0, Math.floor((event.clientY - rect.top) / HOUR)) * 60;
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

