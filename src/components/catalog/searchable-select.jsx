"use client";

import { forwardRef } from "react";
import { PosSearchableSelect } from "@/components/sales/pos-searchable-select";

/** Default form control class (mirrors catalog-shared inputClassName, avoids circular import). */
const FORM_INPUT_CLASS =
  "theme-input theme-input-focus h-[38px] w-full rounded-lg border px-3 py-2 text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60";

/**
 * Searchable dropdown for ERP forms and filters.
 * Always filterable (including short option lists). Prefer this over native `<select>`.
 *
 * `nativeEvent`: when true, onChange receives `{ target: { value } }` (FilterSelect-compatible).
 */
export const SearchableSelect = forwardRef(function SearchableSelect(
  {
    value,
    onChange,
    options = [],
    placeholder = "— Select —",
    searchPlaceholder = "Search…",
    required = false,
    disabled = false,
    loading = false,
    className = "",
    emptyLabel = "No matches",
    nativeEvent = false,
  },
  ref,
) {
  const inputClassName = className.trim()
    ? className.includes("theme-input")
      ? className.trim()
      : `${FORM_INPUT_CLASS} ${className}`.trim()
    : FORM_INPUT_CLASS;

  return (
    <PosSearchableSelect
      ref={ref}
      value={value}
      onChange={(next) => {
        if (nativeEvent) {
          onChange?.({ target: { value: next } });
          return;
        }
        onChange?.(next);
      }}
      options={options}
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      required={required}
      disabled={disabled}
      loading={loading}
      minSearchLength={0}
      idleSearchLabel="Type to search…"
      emptyLabel={emptyLabel}
      inputClassName={inputClassName}
    />
  );
});
