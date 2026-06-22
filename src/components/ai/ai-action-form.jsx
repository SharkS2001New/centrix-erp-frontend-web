"use client";

import { Field, inputClassName, SELECT_CLASS } from "@/components/catalog/catalog-shared";

function fieldValue(values, name, field) {
  if (values[name] !== undefined && values[name] !== null) return values[name];
  if (field.value !== undefined && field.value !== null) return field.value;
  return field.type === "boolean" ? false : "";
}

export function buildInitialFormValues(formSpec) {
  if (!formSpec?.fields) return {};
  const out = {};
  for (const field of formSpec.fields) {
    out[field.name] = fieldValue({}, field.name, field);
  }
  return out;
}

export function AiActionForm({ formSpec, values, onChange, onSubmit, onCancel, loading }) {
  if (!formSpec?.fields?.length) return null;

  return (
    <form
      className="mt-3 space-y-3 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-indigo-700">{formSpec.title}</p>

      {formSpec.hints?.length ? (
        <ul className="list-inside list-disc text-xs text-slate-600">
          {formSpec.hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      ) : null}

      {formSpec.fields.map((field) => {
        const name = field.name;
        const val = fieldValue(values, name, field);
        const label = field.label ?? name;
        const required = Boolean(field.required);

        if (field.read_only) {
          return (
            <p key={name} className="text-xs text-slate-500">
              {label}: {field.placeholder ?? "Auto-generated"}
            </p>
          );
        }

        if (field.type === "select" && Array.isArray(field.options)) {
          return (
            <Field key={name} label={label} required={required}>
              <select
                className={SELECT_CLASS}
                value={val ?? ""}
                required={required}
                onChange={(e) => onChange(name, e.target.value === "" ? "" : e.target.value)}
              >
                <option value="">Select…</option>
                {field.options.map((opt) => (
                  <option key={String(opt.value)} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
          );
        }

        if (field.type === "boolean") {
          return (
            <label key={name} className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={Boolean(val)}
                onChange={(e) => onChange(name, e.target.checked)}
              />
              {label}
            </label>
          );
        }

        if (field.type === "textarea") {
          return (
            <Field key={name} label={label} required={required}>
              <textarea
                className={`${inputClassName()} min-h-[72px]`}
                value={val ?? ""}
                required={required}
                placeholder={field.placeholder ?? ""}
                onChange={(e) => onChange(name, e.target.value)}
              />
            </Field>
          );
        }

        const inputType =
          field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "date" ? "date" : "text";

        return (
          <Field key={name} label={label} required={required}>
            <input
              type={inputType}
              className={inputClassName()}
              value={val ?? ""}
              required={required}
              step={field.type === "number" ? "any" : undefined}
              placeholder={field.placeholder ?? ""}
              onChange={(e) =>
                onChange(name, field.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value)
              }
            />
          </Field>
        );
      })}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {formSpec.submit_label ?? "Confirm & create"}
        </button>
        <button
          type="button"
          disabled={loading}
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
