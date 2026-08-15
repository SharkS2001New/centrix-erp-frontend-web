"use client";

import { Field, FILTER_CONTROL_CLASS, FilterToolbar, PrimaryButton } from "@/components/catalog/catalog-shared";

/** Title-row actions: Refresh, Export, Add — same alignment as inventory/sales. */
export function HrPageActions({ children }) {
  return <div className="flex flex-wrap items-center gap-2">{children}</div>;
}

/** Left-aligned filter row: dates, search, and related controls sit on one line. */
export function HrFilterToolbar({ children, className = "" }) {
  return <FilterToolbar className={className}>{children}</FilterToolbar>;
}

export function HrDateField({ label, value, onChange }) {
  return (
    <Field label={label}>
      <input
        type="date"
        className={FILTER_CONTROL_CLASS}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

export function HrFilterButton({ onClick, loading = false, disabled = false }) {
  return (
    <div className="pb-0.5">
      <PrimaryButton type="button" showIcon={false} disabled={disabled || loading} onClick={onClick}>
        {loading ? "Loading…" : "Filter"}
      </PrimaryButton>
    </div>
  );
}
