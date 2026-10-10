"use client";

import { useEffect, useRef } from "react";
import { SearchableSelect } from "@/components/catalog/searchable-select";

export function PageTitle({ title, subtitle, action }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="theme-heading text-xl font-medium">{title}</h1>
        {subtitle ? <p className="theme-subtext mt-1 text-sm">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function Card({ children, className = "" }) {
  return <section className={`theme-panel rounded-xl border p-4 shadow-sm ${className}`}>{children}</section>;
}

export function Stat({ label, value, hint }) {
  return (
    <Card>
      <p className="theme-subtext text-sm">{label}</p>
      <p className="theme-heading mt-2 text-2xl font-semibold">{value}</p>
      {hint ? <p className="theme-subtext mt-1 text-xs">{hint}</p> : null}
    </Card>
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

export function FormCard({ title, hint, children, submitLabel, onSubmit }) {
  return (
    <Card className="mb-5 max-w-xl">
      {title ? <h2 className="theme-heading text-sm font-semibold">{title}</h2> : null}
      {hint ? <p className="theme-subtext mt-1 text-sm">{hint}</p> : null}
      <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-4">
        {children}
        <div className="pt-1">
          <button className={primaryButtonClass} type="submit">{submitLabel}</button>
        </div>
      </form>
    </Card>
  );
}

export function Empty({ children }) {
  return <p className="theme-subtext py-8 text-center text-sm">{children}</p>;
}

export function money(value) {
  const amount = Number(value) || 0;
  return `KSh ${amount.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
