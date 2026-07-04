"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HrSearchableSelect } from "@/components/hr/hr-searchable-select";
import { ProductSearchSelect } from "@/components/catalog/product-search-select";
import { PosSearchableSelect } from "@/components/sales/pos-searchable-select";
import { FILTER_CONTROL_CLASS } from "@/components/catalog/catalog-shared";
import {
  reportFilterPlaceholder,
  reportFilterUsesAsyncSearch,
  reportFilterUsesLocalSearch,
  resolveReportFilterSelection,
  searchReportFilterOptions,
} from "@/lib/reports/report-filter-search";

/** Room for long route names, product labels, and customer text while searching. */
export const REPORT_FILTER_SEARCH_WRAPPER_CLASS = "w-full min-w-[22rem] max-w-[36rem]";

export function reportFilterSearchControlClass(baseClass = FILTER_CONTROL_CLASS) {
  return `${baseClass} w-full min-w-[22rem] max-w-[36rem]`
    .replace(/\bw-auto\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function ReportSearchFieldWrap({ children }) {
  return (
    <div className={REPORT_FILTER_SEARCH_WRAPPER_CLASS}>
      <div className="w-full">{children}</div>
    </div>
  );
}

function mergeOptions(existing, incoming) {
  const merged = [...existing];
  for (const option of incoming) {
    if (!merged.some((row) => String(row.value) === String(option.value))) {
      merged.push(option);
    }
  }
  return merged;
}

function ReportAsyncSearchSelect({
  optionsKey,
  value,
  onChange,
  label,
  controlClassName,
  required = false,
}) {
  const [pinnedOptions, setPinnedOptions] = useState([]);

  useEffect(() => {
    if (!value) return undefined;

    let cancelled = false;
    void resolveReportFilterSelection(optionsKey, value).then((option) => {
      if (cancelled || !option) return;
      setPinnedOptions((prev) => {
        if (prev.some((row) => String(row.value) === String(option.value))) return prev;
        return mergeOptions(prev, [option]);
      });
    });

    return () => {
      cancelled = true;
    };
  }, [optionsKey, value]);

  const loadOptions = useCallback(
    async (query) => {
      const rows = await searchReportFilterOptions(optionsKey, query);
      setPinnedOptions((prev) => mergeOptions(prev, rows));
      return rows;
    },
    [optionsKey],
  );

  const placeholder = reportFilterPlaceholder(optionsKey, label);

  return (
    <ReportSearchFieldWrap>
      <PosSearchableSelect
        value={value ?? ""}
        onChange={(nextValue, option) => {
          onChange(nextValue);
          if (option) {
            setPinnedOptions((prev) => mergeOptions(prev, [option]));
          }
        }}
        options={pinnedOptions}
        loadOptions={loadOptions}
        minSearchLength={1}
        placeholder={placeholder}
        searchPlaceholder={`Search ${String(label ?? "options").toLowerCase()}…`}
        idleSearchLabel={`Type to search ${String(label ?? "options").toLowerCase()}`}
        emptyLabel="No matches"
        inputClassName={controlClassName}
        required={required}
      />
    </ReportSearchFieldWrap>
  );
}

/**
 * @param {{
 *   filter: { id: string, label: string, optionsKey?: string, placeholder?: string },
 *   value: string,
 *   onChange: (value: string) => void,
 *   options: Array<{ value: string, label: string, searchText?: string }>,
 *   controlClassName?: string,
 *   required?: boolean,
 * }} props
 */
export function ReportFilterSearchSelect({ filter, value, onChange, options, controlClassName, required = false }) {
  const optionsKey = filter.optionsKey ?? "";
  const searchControlClass = reportFilterSearchControlClass(controlClassName);

  if (filter.id === "product_code" || optionsKey === "products") {
    return (
      <ReportSearchFieldWrap>
        <ProductSearchSelect
          value={value ?? ""}
          onChange={onChange}
          placeholder={filter.placeholder ?? "Search product name or code…"}
          required={required}
          inputClassName={searchControlClass}
        />
      </ReportSearchFieldWrap>
    );
  }

  if (reportFilterUsesAsyncSearch(optionsKey)) {
    return (
      <ReportAsyncSearchSelect
        optionsKey={optionsKey}
        value={value ?? ""}
        onChange={onChange}
        label={filter.label}
        controlClassName={searchControlClass}
        required={required}
      />
    );
  }

  const optionCount = options.filter((row) => row.value !== "").length;

  if (reportFilterUsesLocalSearch(optionsKey, optionCount)) {
    return (
      <ReportSearchFieldWrap>
        <HrSearchableSelect
          value={value ?? ""}
          onChange={onChange}
          options={options}
          placeholder={reportFilterPlaceholder(optionsKey, filter.label)}
          inputClassName={searchControlClass}
        />
      </ReportSearchFieldWrap>
    );
  }

  return null;
}

export function ReportBranchSearchSelect({ value, onChange, branches, controlClassName }) {
  const searchControlClass = reportFilterSearchControlClass(controlClassName);
  const options = useMemo(
    () => [
      { value: "", label: "All branches" },
      ...branches.map((branch) => ({
        value: String(branch.id),
        label: branch.branch_name ?? `Branch #${branch.id}`,
      })),
    ],
    [branches],
  );

  if (branches.length <= 6) {
    return (
      <ReportSearchFieldWrap>
        <select className={searchControlClass} value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          {options.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </ReportSearchFieldWrap>
    );
  }

  return (
    <ReportSearchFieldWrap>
      <HrSearchableSelect
        value={value ?? ""}
        onChange={onChange}
        options={options}
        placeholder="All branches"
        inputClassName={searchControlClass}
      />
    </ReportSearchFieldWrap>
  );
}
