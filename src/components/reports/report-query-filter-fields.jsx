"use client";

import { Field, FILTER_CONTROL_CLASS, inputClassName } from "@/components/catalog/catalog-shared";
import { ReportFilterSearchSelect, reportFilterSearchControlClass } from "@/components/reports/report-filter-search-select";
import { REPORT_EXTRA_FILTERS } from "@/lib/reports/report-filter-config";
import { REPORT_SHORT_SELECT_KEYS } from "@/lib/reports/report-filter-search";

/**
 * @param {{
 *   reportKey?: string,
 *   values: Record<string, string>,
 *   onChange: (id: string, value: string) => void,
 *   optionsByKey: Record<string, Array<{ value: string, label: string }>>,
 *   controlClassName?: string,
 * }} props
 */
export function ReportQueryFilterFields({
  reportKey,
  values,
  onChange,
  optionsByKey,
  controlClassName = FILTER_CONTROL_CLASS,
}) {
  const filters = REPORT_EXTRA_FILTERS[reportKey] ?? [];
  if (!filters.length) return null;

  return filters.map((filter) => {
    if (filter.type === "checkbox") {
      return (
        <label key={filter.id} className="flex cursor-pointer items-center gap-2 pb-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={Boolean(values[filter.id])}
            onChange={(e) => onChange(filter.id, e.target.checked ? "1" : "")}
          />
          {filter.label}
        </label>
      );
    }

    if (filter.type === "text") {
      return (
        <Field key={filter.id} label={filter.label}>
          <input
            type="text"
            className={reportFilterSearchControlClass(controlClassName)}
            value={values[filter.id] ?? ""}
            placeholder={filter.placeholder}
            onChange={(e) => onChange(filter.id, e.target.value)}
          />
        </Field>
      );
    }

    if (filter.type === "select") {
      const options = optionsByKey[filter.optionsKey] ?? [{ value: "", label: "All" }];
      const useNativeSelect = REPORT_SHORT_SELECT_KEYS.has(filter.optionsKey ?? "");

      if (!useNativeSelect) {
        return (
          <Field key={filter.id} label={filter.label}>
            <ReportFilterSearchSelect
              filter={filter}
              value={values[filter.id] ?? ""}
              onChange={(nextValue) => onChange(filter.id, nextValue)}
              options={options}
              controlClassName={controlClassName}
            />
          </Field>
        );
      }

      return (
        <Field key={filter.id} label={filter.label}>
          <select
            className={controlClassName}
            value={values[filter.id] ?? ""}
            onChange={(e) => onChange(filter.id, e.target.value)}
          >
            {options.map((opt) => (
              <option key={`${filter.id}-${opt.value}`} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>
      );
    }

    return null;
  });
}

/** Structured report filter bar variant (uses theme input classes). */
export function ReportQueryFilterFieldsStructured({ reportKey, values, onChange, optionsByKey }) {
  return (
    <ReportQueryFilterFields
      reportKey={reportKey}
      values={values}
      onChange={onChange}
      optionsByKey={optionsByKey}
      controlClassName={inputClassName()}
    />
  );
}
