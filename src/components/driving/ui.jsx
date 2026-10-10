"use client";

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
