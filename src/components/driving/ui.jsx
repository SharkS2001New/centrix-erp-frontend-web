"use client";

import { useEffect, useRef, useState } from "react";
import { FilterToolbar, SearchInput } from "@/components/catalog/catalog-shared";
import { SearchableSelect } from "@/components/catalog/searchable-select";

export function ScreenHeader({ title, subtitle, children }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="theme-heading text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="theme-subtext mt-1 max-w-2xl text-sm">{subtitle}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  );
}

export function PageTitle({ title, subtitle, action }) {
  return (
    <ScreenHeader title={title} subtitle={subtitle}>
      {action}
    </ScreenHeader>
  );
}

export function Card({ children, className = "" }) {
  return <section className={`theme-panel rounded-2xl border p-4 shadow-sm ${className}`}>{children}</section>;
}

const STAT_TONE = {
  indigo: "bg-indigo-50 text-indigo-600",
  sky: "bg-sky-50 text-sky-600",
  emerald: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-700",
  rose: "bg-rose-50 text-rose-600",
  violet: "bg-violet-50 text-violet-600",
};

export function Stat({ label, value, hint, icon = null, tone = "indigo" }) {
  const toneClass = STAT_TONE[tone] ?? STAT_TONE.indigo;
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <p className="theme-subtext text-xs font-medium uppercase tracking-wide">{label}</p>
        {icon ? (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClass}`} aria-hidden>
            <i className={`bi bi-${icon} text-base`} />
          </span>
        ) : null}
      </div>
      <p className="theme-heading text-2xl font-semibold leading-none tabular-nums">{value}</p>
      {hint ? (
        <span className="theme-subtext inline-flex w-fit items-center rounded-full border border-[var(--theme-border)] px-2 py-0.5 text-xs">{hint}</span>
      ) : null}
    </Card>
  );
}

export function Toolbar({ children }) {
  return <FilterToolbar>{children}</FilterToolbar>;
}

export function SearchField({ value, onChange, placeholder = "Search" }) {
  return (
    <SearchInput
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

const STATUS_TONE = {
  positive: { pill: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  info: { pill: "bg-sky-50 text-sky-700", dot: "bg-sky-500" },
  warning: { pill: "bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  danger: { pill: "bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  neutral: { pill: "bg-slate-100 text-slate-600", dot: "bg-slate-400" },
};

const STATUS_FAMILY = {
  active: "positive",
  available: "positive",
  completed: "positive",
  present: "positive",
  paid: "positive",
  in: "positive",
  verified: "positive",
  passed: "positive",
  graduated: "positive",
  scheduled: "info",
  confirmed: "info",
  in_progress: "info",
  queued: "info",
  sent: "info",
  recorded: "info",
  open: "warning",
  pending: "warning",
  partial: "warning",
  in_use: "warning",
  late: "warning",
  due_soon: "warning",
  maintenance: "danger",
  suspended: "danger",
  absent: "danger",
  no_show: "danger",
  overdue: "danger",
  failed: "danger",
  expired: "danger",
  terminated: "danger",
  cancelled: "neutral",
  inactive: "neutral",
  out: "neutral",
  void: "neutral",
  draft: "neutral",
};

export function StatusBadge({ value }) {
  const key = String(value || "").toLowerCase();
  const tone = STATUS_TONE[STATUS_FAMILY[key]] || STATUS_TONE.neutral;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tone.pill}`}>
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
      {key.replace(/_/g, " ") || "—"}
    </span>
  );
}

const AVATAR_TONE = [
  "bg-sky-100 text-sky-800",
  "bg-emerald-100 text-emerald-800",
  "bg-violet-100 text-violet-800",
  "bg-amber-100 text-amber-800",
  "bg-rose-100 text-rose-800",
];

export function PersonName({ name, detail }) {
  const label = String(name || "—");
  const initials = label
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const tone = AVATAR_TONE[(label.charCodeAt(0) || 0) % AVATAR_TONE.length];
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${tone}`}>{initials || "?"}</span>
      <span className="min-w-0">
        <span className="theme-heading block truncate font-medium">{label}</span>
        {detail ? <span className="theme-subtext block truncate text-xs">{detail}</span> : null}
      </span>
    </span>
  );
}

export function DataTable({ columns, rows, empty }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="theme-subtext border-b border-[var(--theme-border)] text-xs uppercase tracking-wide">
            {columns.map((column) => (
              <th key={column.key} className="px-3 py-3 font-medium">{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? index} className="border-b border-[var(--theme-border)] last:border-0">
              {columns.map((column) => (
                <td key={column.key} className="px-3 py-3 align-middle">
                  {column.render ? column.render(row) : (row[column.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Sparkline({ points = [] }) {
  const values = points.map((point) => Number(point.collected) || 0);
  if (values.length === 0) return <Empty>No receipts in this period yet.</Empty>;
  const max = Math.max(...values, 1);
  const width = 320;
  const height = 128;
  const coords = values.map((value, index) => {
    const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
    const y = height - (value / max) * (height - 20) - 8;
    return [x, y];
  });
  const line = coords.map(([x, y], index) => `${index ? "L" : "M"}${x},${y}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="mt-3 h-36 w-full" role="img" aria-label="Receipts trend">
      <path d={`${line} L${width},${height} L0,${height} Z`} fill="color-mix(in srgb, var(--theme-primary) 16%, transparent)" />
      <path d={line} fill="none" stroke="var(--theme-primary)" strokeWidth="2.5" strokeLinejoin="round" />
    </svg>
  );
}

export function Editor({ open, title, onClose, children, wide = false }) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeRef.current?.();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRef.current?.();
      }}
    >
      <div className={`theme-panel my-4 w-full rounded-2xl border p-5 shadow-xl ${wide ? "max-w-4xl" : "max-w-xl"}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="theme-heading text-lg font-semibold">{title}</h2>
          <button type="button" className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm" onClick={() => closeRef.current?.()}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const BOARD_START = 8;
const BOARD_END = 18;
const BOARD_ROW = 64;

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function lessonTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function lessonDay(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function clockMinutes(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return BOARD_START * 60;
  return date.getHours() * 60 + date.getMinutes();
}

export function DayBoard({ lessons = [], instructors = [], onLessonAction = null, onLessonReschedule = null, onLessonFeedback = null, onLessonDrop = null, onAddLesson = null, busyLessonId = null }) {
  const [dropKey, setDropKey] = useState(null);
  const hours = [];
  for (let hour = BOARD_START; hour < BOARD_END; hour += 1) hours.push(hour);
  const columns = [];
  for (const instructor of instructors) {
    columns.push({ id: instructor.id, full_name: instructor.full_name });
  }
  for (const lesson of lessons) {
    const id = lesson.instructor?.id || lesson.instructor_id;
    if (id && !columns.some((column) => String(column.id) === String(id))) {
      columns.push({ id, full_name: lesson.instructor?.full_name || "Instructor" });
    }
  }
  if (columns.length === 0) columns.push({ id: "all", full_name: "Lessons" });
  const height = hours.length * BOARD_ROW;

  function hourFromPointer(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const offset = event.clientY - rect.top;
    const index = Math.min(hours.length - 1, Math.max(0, Math.floor(offset / BOARD_ROW)));
    return hours[index];
  }

  function dropHour(event) {
    event.preventDefault();
    setDropKey(null);
    const id = event.dataTransfer.getData("text/plain");
    const lesson = lessons.find((row) => String(row.id) === id);
    if (!lesson) return;
    const base = new Date(lesson.starts_at);
    if (Number.isNaN(base.getTime())) return;
    const hour = hourFromPointer(event);
    const pad = (number) => String(number).padStart(2, "0");
    const datePart = `${base.getFullYear()}-${pad(base.getMonth() + 1)}-${pad(base.getDate())}`;
    onLessonDrop(lesson, `${datePart}T${pad(hour)}:${pad(base.getMinutes())}:00`);
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]" style={{ display: "grid", gridTemplateColumns: `76px repeat(${columns.length}, minmax(150px, 1fr))` }}>
        <div />
        {columns.map((column) => (
          <div key={column.id} className="theme-heading px-2 pb-3 text-center text-sm font-medium">{column.full_name}</div>
        ))}
        <div className="relative" style={{ height }}>
          {hours.map((hour, index) => (
            <div key={hour} className="theme-subtext absolute right-2 text-xs" style={{ top: index * BOARD_ROW - 6 }}>
              {String(hour).padStart(2, "0")}:00
            </div>
          ))}
        </div>
        {columns.map((column) => (
          <div
            key={column.id}
            className="relative border-l border-[var(--theme-border)]"
            style={{ height }}
            onDragOver={onLessonDrop ? (event) => {
              event.preventDefault();
              const key = `${column.id}-${hourFromPointer(event)}`;
              if (dropKey !== key) setDropKey(key);
            } : undefined}
            onDragLeave={onLessonDrop ? () => setDropKey(null) : undefined}
            onDrop={onLessonDrop ? (event) => dropHour(event) : undefined}
          >
            {hours.map((hour, index) => (
              <div key={hour} className="pointer-events-none absolute inset-x-0 border-t border-[var(--theme-border)]" style={{ top: index * BOARD_ROW }} />
            ))}
            {onAddLesson ? hours.map((hour, index) => (
              <button
                key={`slot-${hour}`}
                type="button"
                onClick={() => onAddLesson(column.id, hour)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onAddLesson(column.id, hour);
                }}
                title={`Add lesson at ${String(hour).padStart(2, "0")}:00`}
                aria-label={`Add lesson${column.id === "all" ? "" : ` with ${column.full_name}`} at ${String(hour).padStart(2, "0")}:00`}
                className="absolute inset-x-0 z-0 flex items-center justify-center rounded text-[11px] font-semibold text-[var(--theme-primary)] opacity-0 transition hover:bg-[color-mix(in_srgb,var(--theme-primary)_8%,transparent)] hover:opacity-100 focus-visible:opacity-100"
                style={{ top: index * BOARD_ROW, height: BOARD_ROW }}
              >
                + Add
              </button>
            )) : null}
            {hours.map((hour, index) =>
              dropKey === `${column.id}-${hour}` ? (
                <div key={`drop-${hour}`} className="pointer-events-none absolute inset-x-0 bg-[color-mix(in_srgb,var(--theme-primary)_14%,transparent)]" style={{ top: index * BOARD_ROW, height: BOARD_ROW }} />
              ) : null,
            )}
            {lessons
              .filter((lesson) => column.id === "all" || String(lesson.instructor?.id || lesson.instructor_id) === String(column.id))
              .map((lesson, index) => {
                const start = clockMinutes(lesson.starts_at) - BOARD_START * 60;
                const endText = lesson.ends_at ? clockMinutes(lesson.ends_at) - BOARD_START * 60 : start + 60;
                const top = (start / 60) * BOARD_ROW;
                const block = Math.max(onLessonAction || onLessonReschedule || onLessonFeedback ? 78 : 42, ((endText - start) / 60) * BOARD_ROW - 8);
                const done = ["completed", "cancelled", "no_show"].includes(String(lesson.status || ""));
                const tone = done
                  ? "border-slate-200 bg-slate-100 text-slate-700"
                  : lesson.lesson_type === "theory"
                    ? "border-violet-200 bg-violet-100 text-violet-950"
                    : "border-sky-200 bg-sky-100 text-sky-950";
                const busy = String(busyLessonId) === String(lesson.id);
                return (
                  <div
                    key={lesson.id}
                    className={`absolute inset-x-1 z-10 overflow-hidden rounded-lg border px-2 py-1 text-xs ${tone} ${onLessonDrop ? "cursor-grab active:cursor-grabbing" : ""}`}
                    style={{ top: Math.max(0, top), height: block }}
                    draggable={Boolean(onLessonDrop)}
                    onDragStart={onLessonDrop ? (event) => {
                      event.dataTransfer.setData("text/plain", String(lesson.id));
                      event.dataTransfer.effectAllowed = "move";
                    } : undefined}
                  >
                    <p className="truncate font-semibold">{lesson.student?.full_name || "Student"}</p>
                    <p className="truncate capitalize opacity-80">
                      {lesson.lesson_type} · {lessonTime(lesson.starts_at)}
                      {lesson.status && lesson.status !== "scheduled" ? ` · ${lesson.status}` : ""}
                    </p>
                    {onLessonAction || onLessonReschedule || onLessonFeedback ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {onLessonAction && !done ? (
                          <>
                            <button type="button" disabled={busy} className="rounded bg-white/80 px-1.5 py-0.5 font-semibold disabled:opacity-50" onClick={() => onLessonAction(lesson, "completed")}>Done</button>
                            <button type="button" disabled={busy} className="rounded bg-white/80 px-1.5 py-0.5 font-semibold disabled:opacity-50" onClick={() => onLessonAction(lesson, "no_show")}>No-show</button>
                            <button type="button" disabled={busy} className="rounded bg-white/80 px-1.5 py-0.5 font-semibold disabled:opacity-50" onClick={() => onLessonAction(lesson, "cancelled")}>Cancel</button>
                          </>
                        ) : null}
                        {onLessonFeedback && done ? (
                          <button type="button" disabled={busy} className="rounded bg-white/80 px-1.5 py-0.5 font-semibold disabled:opacity-50" onClick={() => onLessonFeedback(lesson)}>
                            {lesson.feedback ? "Edit notes" : "Add notes"}
                          </button>
                        ) : null}
                        {onLessonReschedule && !done ? (
                          <button type="button" disabled={busy} className="rounded bg-white/80 px-1.5 py-0.5 font-semibold disabled:opacity-50" onClick={() => onLessonReschedule(lesson)}>Move</button>
                        ) : null}
                      </div>
                    ) : null}
                    <span className="sr-only">{index}</span>
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function addDaysToIso(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + days);
  const pad = (number) => String(number).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function WeekBoard({ lessons = [], weekStart, today = null, selectedLessonId = null, onLessonOpen = null, onDayOpen = null, onAddLesson = null }) {
  const hours = [];
  for (let hour = BOARD_START; hour < BOARD_END; hour += 1) hours.push(hour);
  const gridHeight = hours.length * BOARD_ROW;
  const rangeStart = BOARD_START * 60;
  const rangeEnd = BOARD_END * 60;

  const days = WEEKDAY_LABELS.map((label, index) => {
    const iso = addDaysToIso(weekStart, index);
    const date = new Date(`${iso}T00:00:00`);
    const rows = lessons
      .filter((lesson) => lessonDay(lesson.starts_at) === iso)
      .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));
    const lanes = [];
    const placed = rows.map((lesson) => {
      const start = new Date(lesson.starts_at);
      const end = lesson.ends_at ? new Date(lesson.ends_at) : null;
      const startMinutes = Math.min(rangeEnd, Math.max(rangeStart, start.getHours() * 60 + start.getMinutes()));
      const endMinutes = Math.min(rangeEnd, Math.max(startMinutes + 30, end && !Number.isNaN(end.getTime()) ? end.getHours() * 60 + end.getMinutes() : startMinutes + 60));
      let lane = lanes.findIndex((laneEnd) => laneEnd <= startMinutes);
      if (lane === -1) {
        lanes.push(0);
        lane = lanes.length - 1;
      }
      lanes[lane] = endMinutes;
      return { lesson, top: ((startMinutes - rangeStart) / 60) * BOARD_ROW, height: Math.max(38, ((endMinutes - startMinutes) / 60) * BOARD_ROW - 4), lane };
    });
    return { label, iso, dayNumber: date.getDate(), placed, laneCount: Math.max(1, lanes.length) };
  });

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[860px]">
        <div className="grid" style={{ gridTemplateColumns: `64px repeat(7, minmax(110px, 1fr))` }}>
          <div />
          {days.map((day) => {
            const isToday = today === day.iso;
            return (
              <button
                key={day.iso}
                type="button"
                onClick={() => onDayOpen?.(day.iso)}
                onContextMenu={onAddLesson ? (event) => {
                  event.preventDefault();
                  onAddLesson(day.iso, BOARD_START);
                } : undefined}
                title={`Open ${day.iso}${onAddLesson ? " · right-click to add a lesson" : ""}`}
                className="mb-2 flex flex-col items-center rounded-lg px-1 py-1.5 transition hover:bg-[color-mix(in_srgb,var(--theme-primary)_6%,transparent)]"
              >
                <span className={`text-[11px] font-medium uppercase ${isToday ? "text-[var(--theme-primary)]" : "theme-subtext"}`}>{day.label}</span>
                <span className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${isToday ? "bg-[var(--theme-primary)] text-white" : "theme-heading"}`}>{day.dayNumber}</span>
              </button>
            );
          })}
          <div className="relative" style={{ height: gridHeight }}>
            {hours.map((hour, index) => (
              <div key={hour} className="theme-subtext absolute right-2 -translate-y-2 text-[11px] tabular-nums" style={{ top: index * BOARD_ROW }}>
                {pad2(hour)}:00
              </div>
            ))}
          </div>
          {days.map((day) => (
            <div key={day.iso} className="relative border-l border-[var(--theme-border)]" style={{ height: gridHeight }}>
              {hours.map((hour, index) => (
                <div key={hour} className="pointer-events-none absolute inset-x-0 border-t border-[var(--theme-border)]" style={{ top: index * BOARD_ROW }} />
              ))}
              {onAddLesson ? hours.map((hour, index) => (
                <button
                  key={`slot-${hour}`}
                  type="button"
                  onClick={() => onAddLesson(day.iso, hour)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    onAddLesson(day.iso, hour);
                  }}
                  title={`Add lesson ${day.iso} at ${pad2(hour)}:00`}
                  aria-label={`Add lesson ${day.iso} at ${pad2(hour)}:00`}
                  className="absolute inset-x-0 z-0 flex items-center justify-center rounded text-[11px] font-semibold text-[var(--theme-primary)] opacity-0 transition hover:bg-[color-mix(in_srgb,var(--theme-primary)_8%,transparent)] hover:opacity-100 focus-visible:opacity-100"
                  style={{ top: index * BOARD_ROW, height: BOARD_ROW }}
                >
                  + Add
                </button>
              )) : null}
              {day.placed.map(({ lesson, top, height, lane }) => {
                const done = ["completed", "cancelled", "no_show"].includes(String(lesson.status || ""));
                const tone = done
                  ? "border-slate-200 bg-slate-100 text-slate-700"
                  : lesson.lesson_type === "theory"
                    ? "border-violet-200 bg-violet-50 text-violet-950"
                    : "border-emerald-200 bg-emerald-50 text-emerald-950";
                const selected = String(selectedLessonId) === String(lesson.id);
                const width = 100 / day.laneCount;
                return (
                  <button
                    key={lesson.id}
                    type="button"
                    onClick={() => onLessonOpen?.(lesson)}
                    aria-pressed={selected}
                    aria-label={`${lessonTime(lesson.starts_at)} ${lesson.student?.full_name || "Student"} with ${lesson.instructor?.full_name || "instructor"}${lesson.status ? ` (${String(lesson.status).replace(/_/g, " ")})` : ""}`}
                    className={`absolute z-10 overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:brightness-[0.98] ${tone} ${selected ? "ring-2 ring-[var(--theme-primary)] ring-offset-1" : ""}`}
                    style={{ top: top + 2, height, left: `calc(${lane * width}% + 2px)`, width: `calc(${width}% - 4px)` }}
                  >
                    <span className="block font-semibold tabular-nums">{lessonTime(lesson.starts_at)}</span>
                    <span className="block truncate font-medium">{lesson.student?.full_name || "Student"}</span>
                    <span className="block truncate opacity-75">{lesson.instructor?.full_name || "Instructor"}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const MONTH_CHIP_LIMIT = 3;

export function MonthBoard({ lessons = [], monthStart, today = null, onDayOpen = null, onAddLesson = null }) {
  const first = `${String(monthStart).slice(0, 7)}-01`;
  const firstDate = new Date(`${first}T00:00:00`);
  const gridStart = addDaysToIso(first, -((firstDate.getDay() + 6) % 7));
  const lastDate = new Date(firstDate.getFullYear(), firstDate.getMonth() + 1, 0);
  const pad = (number) => String(number).padStart(2, "0");
  const lastIso = `${lastDate.getFullYear()}-${pad(lastDate.getMonth() + 1)}-${pad(lastDate.getDate())}`;
  const gridEnd = addDaysToIso(lastIso, 6 - ((lastDate.getDay() + 6) % 7));
  const monthKey = first.slice(0, 7);

  const days = [];
  for (let iso = gridStart; iso <= gridEnd; iso = addDaysToIso(iso, 1)) {
    const date = new Date(`${iso}T00:00:00`);
    days.push({
      iso,
      dayNumber: date.getDate(),
      inMonth: iso.slice(0, 7) === monthKey,
      rows: lessons
        .filter((lesson) => lessonDay(lesson.starts_at) === iso)
        .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))),
    });
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[840px]">
        <div className="grid grid-cols-7 gap-1 pb-1">
          {WEEKDAY_LABELS.map((label) => (
            <div key={label} className="theme-subtext px-2 text-xs font-medium uppercase">{label}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {days.map((day) => {
            const isToday = today === day.iso;
            const visible = day.rows.slice(0, MONTH_CHIP_LIMIT);
            const hidden = day.rows.length - visible.length;
            return (
              <div
                key={day.iso}
                className={`group relative flex min-h-[104px] flex-col gap-1 rounded-lg border p-1.5 transition ${isToday ? "border-[var(--theme-primary)] bg-[color-mix(in_srgb,var(--theme-primary)_6%,transparent)]" : "border-[var(--theme-border)]"} ${day.inMonth ? "" : "opacity-55"}`}
                onContextMenu={onAddLesson ? (event) => {
                  event.preventDefault();
                  onAddLesson(day.iso);
                } : undefined}
              >
                <button
                  type="button"
                  onClick={() => onDayOpen?.(day.iso)}
                  aria-label={`${day.iso}: ${day.rows.length} ${day.rows.length === 1 ? "lesson" : "lessons"}. Open day view.`}
                  className="flex flex-1 flex-col gap-1 text-left"
                >
                  <span className="flex items-baseline justify-between gap-1">
                    <span className={`theme-heading text-sm font-semibold tabular-nums ${isToday ? "text-[var(--theme-primary)]" : ""}`}>{day.dayNumber}</span>
                    {day.rows.length > 0 ? (
                      <span className="theme-subtext text-[11px] tabular-nums">{day.rows.length} {day.rows.length === 1 ? "lesson" : "lessons"}</span>
                    ) : null}
                  </span>
                  {visible.map((lesson) => {
                    const done = ["completed", "cancelled", "no_show"].includes(String(lesson.status || ""));
                    const tone = done
                      ? "border-slate-200 bg-slate-100 text-slate-700"
                      : lesson.lesson_type === "theory"
                        ? "border-violet-200 bg-violet-100 text-violet-950"
                        : "border-sky-200 bg-sky-100 text-sky-950";
                    return (
                      <span key={lesson.id} className={`block truncate rounded border px-1 py-0.5 text-[11px] ${tone}`}>
                        <span className="font-semibold tabular-nums">{lessonTime(lesson.starts_at)}</span> {lesson.student?.full_name || "Student"}
                      </span>
                    );
                  })}
                  {hidden > 0 ? <span className="theme-subtext text-[11px] font-medium">+{hidden} more</span> : null}
                </button>
                {onAddLesson ? (
                  <button
                    type="button"
                    onClick={() => onAddLesson(day.iso)}
                    aria-label={`Add lesson on ${day.iso}`}
                    title={`Add lesson on ${day.iso} (right-click the day)`}
                    className="w-full rounded border border-dashed border-transparent px-1 py-0.5 text-[11px] font-semibold text-[var(--theme-primary)] opacity-0 transition hover:border-[var(--theme-primary)] hover:bg-[color-mix(in_srgb,var(--theme-primary)_8%,transparent)] focus-visible:opacity-100 focus-visible:border-[var(--theme-primary)] group-hover:opacity-100"
                  >
                    + Add lesson
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function BarChart({ points = [], format = (value) => value }) {
  if (points.length === 0) return <Empty>No data for this period.</Empty>;
  const max = Math.max(...points.map((point) => Number(point.value) || 0), 1);
  return (
    <div>
      <div className="flex h-44 items-end gap-2">
        {points.map((point) => {
          const value = Number(point.value) || 0;
          return (
            <div key={point.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <span className="theme-subtext text-[10px] tabular-nums">{format(value)}</span>
              <div
                className="w-full rounded-t-md bg-[var(--theme-primary)]"
                style={{ height: `${Math.max(3, (value / max) * 100)}%` }}
                title={`${point.label}: ${format(value)}`}
              />
              <span className="theme-subtext text-[10px]">{point.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Donut({ value = 0, label = "" }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-32 w-32">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" role="img" aria-label={`${pct}% ${label}`}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="var(--theme-border)" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--theme-primary)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="theme-heading text-xl font-semibold tabular-nums">{pct}%</span>
        <span className="theme-subtext max-w-[90px] text-center text-[10px] leading-tight">{label}</span>
      </div>
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <label className="theme-heading block text-sm">
      <span className="theme-subtext mb-1 block text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

export const inputClass =
  "theme-input theme-input-focus h-[38px] w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

export const primaryButtonClass = "theme-primary-btn rounded-lg px-4 py-2 text-sm font-semibold";

export function DrivingSelect({ value, onChange, options, placeholder = "Choose" }) {
  return (
    <SearchableSelect
      nativeEvent
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      className={inputClass}
    />
  );
}

export function FormSection({ title }) {
  return <p className="theme-heading pt-1 text-xs font-semibold uppercase tracking-wide">{title}</p>;
}

export function MarkPad({ onChange }) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(scale, scale);
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.strokeStyle = "#0f172a";
  }, []);

  function point(event) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function start(event) {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    drawing.current = true;
    canvasRef.current.setPointerCapture(event.pointerId);
    const next = point(event);
    context.beginPath();
    context.moveTo(next.x, next.y);
  }

  function move(event) {
    if (!drawing.current) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const next = point(event);
    context.lineTo(next.x, next.y);
    context.stroke();
  }

  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.restore();
    onChange("");
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        className="h-36 w-full touch-none rounded-lg border border-[var(--theme-border)] bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <button type="button" className="theme-secondary-btn mt-2 rounded-lg px-3 py-1.5 text-xs font-medium" onClick={clear}>
        Clear mark
      </button>
    </div>
  );
}

export function FormCard({ title, hint, children, submitLabel, onSubmit, onCancel, cancelLabel = "Cancel", bare = false, wide = false }) {
  const form = (
    <form onSubmit={onSubmit} className={`${bare ? "" : "mt-4"} flex flex-col gap-4`}>
      {children}
      <div className="flex justify-end gap-2 border-t border-[var(--theme-border)] pt-4">
        {onCancel ? <button type="button" className="theme-secondary-btn rounded-lg px-4 py-2 text-sm font-medium" onClick={onCancel}>{cancelLabel}</button> : null}
        <button className={primaryButtonClass} type="submit">{submitLabel}</button>
      </div>
    </form>
  );
  const headed = (
    <>
      {title ? <h2 className="theme-heading text-sm font-semibold">{title}</h2> : null}
      {hint ? <p className="theme-subtext mt-1 mb-4 text-sm">{hint}</p> : null}
      {form}
    </>
  );
  if (bare) return headed;
  return <Card className={`mb-5 ${wide ? "max-w-4xl" : "max-w-xl"}`}>{headed}</Card>;
}

export function Empty({ children }) {
  return <p className="theme-subtext py-8 text-center text-sm">{children}</p>;
}

export function money(value) {
  const amount = Number(value) || 0;
  return `KSh ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
