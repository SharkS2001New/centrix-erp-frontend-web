"use client";

import { inputClassName } from "@/components/catalog/catalog-shared";

export function MultilinePrintNotesField({
  label,
  hint,
  value,
  onChange,
  rows = 6,
  placeholder,
}) {
  return (
    <label className="block">
      <span className="theme-subtext mb-1 block text-xs font-medium">{label}</span>
      {hint ? <p className="mb-2 text-xs text-slate-500">{hint}</p> : null}
      <textarea
        className={`${inputClassName()} min-h-[120px] font-mono text-xs`}
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
