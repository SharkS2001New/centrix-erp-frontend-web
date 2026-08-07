"use client";

import { SearchableSelect } from "@/components/catalog/searchable-select";

/** Same control class as catalog-shared FILTER_CONTROL_CLASS (avoid circular import). */
const CONTROL_CLASS =
  "theme-input theme-input-focus h-[38px] w-auto min-w-[10.5rem] shrink-0 rounded-lg border px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Toolbar filter select with searchable dropdown (sticky search + scroll list).
 * Preserves the native `<select onChange={(e) => …}>` event shape for existing call sites.
 * Always searchable — including short enum lists.
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
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder ?? options[0]?.label ?? "— Select —"}
      searchPlaceholder={searchPlaceholder}
      disabled={disabled}
      className={`${CONTROL_CLASS} ${className}`.trim()}
      nativeEvent
    />
  );
}
