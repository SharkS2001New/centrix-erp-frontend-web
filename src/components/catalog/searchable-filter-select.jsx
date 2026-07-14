"use client";

import { PosSearchableSelect } from "@/components/sales/pos-searchable-select";

/** Same control class as catalog-shared FILTER_CONTROL_CLASS (avoid circular import). */
const CONTROL_CLASS =
  "theme-input theme-input-focus h-[38px] w-auto min-w-[10.5rem] shrink-0 rounded-lg border px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Toolbar filter select with searchable dropdown (sticky search + scroll list).
 * Preserves the native `<select onChange={(e) => …}>` event shape for existing call sites.
 */
export function SearchableFilterSelect({
  value,
  onChange,
  options = [],
  className = "",
  disabled = false,
  placeholder,
  searchPlaceholder = "Search…",
}) {
  const inputClassName = `${CONTROL_CLASS} ${className}`.trim();

  // Tiny lists stay as native selects (status yes/no, etc.).
  if (options.length <= 4) {
    return (
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={inputClassName}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <PosSearchableSelect
      value={value}
      onChange={(next) => onChange?.({ target: { value: next } })}
      options={options}
      placeholder={placeholder ?? options[0]?.label ?? "— Select —"}
      searchPlaceholder={searchPlaceholder}
      minSearchLength={0}
      idleSearchLabel="Type to search…"
      emptyLabel="No matches"
      disabled={disabled}
      inputClassName={inputClassName}
    />
  );
}
