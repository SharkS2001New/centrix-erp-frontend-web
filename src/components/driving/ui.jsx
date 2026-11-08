"use client";

import { useEffect, useRef } from "react";
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

export function Stat({ label, value, hint }) {
  return (
    <Card>
      <p className="theme-subtext text-xs font-medium uppercase tracking-wide">{label}</p>
      <p className="theme-heading mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint ? <p className="theme-subtext mt-1 text-xs">{hint}</p> : null}
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
  active: "bg-emerald-50 text-emerald-700",
  available: "bg-emerald-50 text-emerald-700",
  completed: "bg-emerald-50 text-emerald-700",
  present: "bg-emerald-50 text-emerald-700",
  paid: "bg-emerald-50 text-emerald-700",
  in: "bg-emerald-50 text-emerald-700",
  scheduled: "bg-sky-50 text-sky-700",
  confirmed: "bg-sky-50 text-sky-700",
  open: "bg-amber-50 text-amber-800",
  in_use: "bg-amber-50 text-amber-800",
  in_progress: "bg-amber-50 text-amber-800",
  late: "bg-amber-50 text-amber-800",
  maintenance: "bg-rose-50 text-rose-700",
  suspended: "bg-rose-50 text-rose-700",
  absent: "bg-rose-50 text-rose-700",
  cancelled: "bg-slate-100 text-slate-600",
  inactive: "bg-slate-100 text-slate-600",
  out: "bg-slate-100 text-slate-600",
  void: "bg-slate-100 text-slate-600",
};

export function StatusBadge({ value }) {
  const key = String(value || "").toLowerCase();
  const tone = STATUS_TONE[key] || "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${tone}`}>
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={title}>
      <div className={`theme-panel my-4 w-full rounded-2xl border p-5 shadow-xl ${wide ? "max-w-4xl" : "max-w-xl"}`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="theme-heading text-lg font-semibold">{title}</h2>
          <button type="button" className="theme-secondary-btn rounded-lg px-3 py-1.5 text-sm" onClick={onClose}>Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const BOARD_START = 8;
const BOARD_END = 18;
const BOARD_ROW = 64;

function clockMinutes(value) {
  const text = String(value || "");
  const hour = Number(text.slice(11, 13));
  const minute = Number(text.slice(14, 16));
  if (!Number.isFinite(hour)) return BOARD_START * 60;
  return hour * 60 + (Number.isFinite(minute) ? minute : 0);
}

export function DayBoard({ lessons = [], instructors = [], onLessonAction = null, busyLessonId = null }) {
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
          <div key={column.id} className="relative border-l border-[var(--theme-border)]" style={{ height }}>
            {hours.map((hour, index) => (
              <div key={hour} className="absolute inset-x-0 border-t border-[var(--theme-border)]" style={{ top: index * BOARD_ROW }} />
            ))}
            {lessons
              .filter((lesson) => column.id === "all" || String(lesson.instructor?.id || lesson.instructor_id) === String(column.id))
              .map((lesson, index) => {
                const start = clockMinutes(lesson.starts_at) - BOARD_START * 60;
                const endText = lesson.ends_at ? clockMinutes(lesson.ends_at) - BOARD_START * 60 : start + 60;
                const top = (start / 60) * BOARD_ROW;
                const block = Math.max(onLessonAction ? 64 : 42, ((endText - start) / 60) * BOARD_ROW - 8);
                const done = ["completed", "cancelled", "no_show"].includes(String(lesson.status || ""));
                const tone = done
                  ? "border-slate-200 bg-slate-100 text-slate-700"
                  : lesson.lesson_type === "theory"
                    ? "border-violet-200 bg-violet-100 text-violet-950"
                    : "border-sky-200 bg-sky-100 text-sky-950";
                const busy = String(busyLessonId) === String(lesson.id);
                return (
                  <div key={lesson.id} className={`absolute inset-x-1 overflow-hidden rounded-lg border px-2 py-1 text-xs ${tone}`} style={{ top: Math.max(0, top), height: block }}>
                    <p className="truncate font-semibold">{lesson.student?.full_name || "Student"}</p>
                    <p className="truncate capitalize opacity-80">
                      {lesson.lesson_type} · {String(lesson.starts_at).slice(11, 16)}
                      {lesson.status && lesson.status !== "scheduled" ? ` · ${lesson.status}` : ""}
                    </p>
                    {onLessonAction && !done ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <button type="button" disabled={busy} className="rounded bg-white/80 px-1.5 py-0.5 font-semibold disabled:opacity-50" onClick={() => onLessonAction(lesson, "completed")}>Done</button>
                        <button type="button" disabled={busy} className="rounded bg-white/80 px-1.5 py-0.5 font-semibold disabled:opacity-50" onClick={() => onLessonAction(lesson, "no_show")}>No-show</button>
                        <button type="button" disabled={busy} className="rounded bg-white/80 px-1.5 py-0.5 font-semibold disabled:opacity-50" onClick={() => onLessonAction(lesson, "cancelled")}>Cancel</button>
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
