"use client";

import { useEffect, useState } from "react";
import { Field, inputClassName, SearchableSelect } from "@/components/catalog/catalog-shared";
import {
  formatTimeDisplay12h,
  partsToTime24h,
  time24hToParts,
} from "@/components/hr/hr-shared";

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const h = i + 1;
  return { value: String(h), label: String(h) };
});

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => {
  const m = String(i).padStart(2, "0");
  return { value: m, label: m };
});

const PERIOD_OPTIONS = [
  { value: "AM", label: "AM" },
  { value: "PM", label: "PM" },
];

/**
 * Dropdown time picker (hour / minute / AM·PM).
 * Keeps partial selections locally until all three are chosen — avoids clearing on first pick.
 *
 * @param {"AM"|"PM"} [defaultPeriod="AM"] Period pre-selected when value is empty (use PM for check-out).
 */
export function HrTimePickerField({
  label,
  value,
  onChange,
  required = false,
  defaultPeriod = "AM",
}) {
  const [parts, setParts] = useState(() => {
    const parsed = time24hToParts(value);
    if (!value) {
      return { hour: "", minute: "", period: defaultPeriod === "PM" ? "PM" : "AM" };
    }
    return parsed;
  });

  useEffect(() => {
    if (value) {
      setParts(time24hToParts(value));
      return;
    }
    setParts((prev) => ({
      hour: "",
      minute: "",
      period: prev.period || (defaultPeriod === "PM" ? "PM" : "AM"),
    }));
  }, [value, defaultPeriod]);

  function updatePart(key, nextValue) {
    const next = { ...parts, [key]: nextValue };
    if (!next.period) {
      next.period = defaultPeriod === "PM" ? "PM" : "AM";
    }
    setParts(next);
    const encoded = partsToTime24h(next.hour, next.minute, next.period);
    onChange(encoded || "");
  }

  const complete = Boolean(
    parts.hour && parts.minute !== "" && parts.period,
  );

  return (
    <Field label={label}>
      <div className="relative z-10 grid grid-cols-3 gap-2">
        <SearchableSelect
          value={parts.hour}
          onChange={(value) => updatePart("hour", value)}
          required={required}
          placeholder="Hour"
          options={HOUR_OPTIONS}
          className={inputClassName()}
        />
        <SearchableSelect
          value={parts.minute}
          onChange={(value) => updatePart("minute", value)}
          required={required}
          placeholder="Min"
          options={MINUTE_OPTIONS}
          className={inputClassName()}
        />
        <SearchableSelect
          value={parts.period || (defaultPeriod === "PM" ? "PM" : "AM")}
          onChange={(value) => updatePart("period", value)}
          required={required}
          options={PERIOD_OPTIONS}
          className={inputClassName()}
        />
      </div>
      {complete ? (
        <p className="mt-1 text-xs text-slate-500">
          {formatTimeDisplay12h(partsToTime24h(parts.hour, parts.minute, parts.period))}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-400">Select hour, minute, and AM/PM</p>
      )}
    </Field>
  );
}
