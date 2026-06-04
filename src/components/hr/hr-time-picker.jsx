"use client";

import { useEffect, useState } from "react";
import { Field, inputClassName } from "@/components/catalog/catalog-shared";
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
 */
export function HrTimePickerField({ label, value, onChange, required = false }) {
  const [parts, setParts] = useState(() => time24hToParts(value));

  useEffect(() => {
    if (value) {
      setParts(time24hToParts(value));
    }
  }, [value]);

  function updatePart(key, nextValue) {
    const next = { ...parts, [key]: nextValue };
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
        <select
          value={parts.hour}
          onChange={(e) => updatePart("hour", e.target.value)}
          required={required}
          aria-label={`${label} hour`}
          className={inputClassName()}
        >
          <option value="">Hour</option>
          {HOUR_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={parts.minute}
          onChange={(e) => updatePart("minute", e.target.value)}
          required={required}
          aria-label={`${label} minute`}
          className={inputClassName()}
        >
          <option value="">Min</option>
          {MINUTE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={parts.period}
          onChange={(e) => updatePart("period", e.target.value)}
          required={required}
          aria-label={`${label} AM or PM`}
          className={inputClassName()}
        >
          {PERIOD_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
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
