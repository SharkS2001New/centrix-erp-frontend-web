"use client";

import { Field, inputClassName, PrimaryButton, SELECT_CLASS } from "@/components/catalog/catalog-shared";

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

function AiField({ label, required, children }) {
  return (
    <Field label={label} required={required}>
      {children}
    </Field>
  );
}

export function AiActionForm({ formSpec, values, onChange, onSubmit, onCancel, loading }) {
  if (!formSpec?.fields?.length) return null;

  return (
    <form
      className="ai-action-form theme-panel mt-3 space-y-3 rounded-lg border p-4 shadow-sm"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide theme-heading">{formSpec.title}</p>

      {formSpec.hints?.length ? (
        <ul className="list-inside list-disc text-xs theme-text-muted">
          {formSpec.hints.map((hint) => (
            <li key={hint}>{hint}</li>
          ))}
        </ul>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {formSpec.fields.map((field) => {
          const name = field.name;
          const val = fieldValue(values, name, field);
          const label = field.label ?? name;
          const required = Boolean(field.required);

          if (field.read_only) {
            return (
              <p key={name} className="text-xs theme-text-muted sm:col-span-2">
                <span className="theme-heading font-medium">{label}:</span>{" "}
                {field.placeholder ?? "Auto-generated"}
              </p>
            );
          }

          if (field.type === "select" && Array.isArray(field.options)) {
            return (
              <AiField key={name} label={label} required={required}>
                <select
                  className={`${SELECT_CLASS} w-full`}
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
                {field.hint ? <p className="mt-1 text-xs theme-text-muted">{field.hint}</p> : null}
              </AiField>
            );
          }

          if (field.type === "boolean") {
            return (
              <label
                key={name}
                className="flex items-center gap-2 text-sm theme-heading sm:col-span-2"
              >
                <input
                  type="checkbox"
                  className="rounded border-[var(--theme-border)]"
                  checked={Boolean(val)}
                  onChange={(e) => onChange(name, e.target.checked)}
                />
                {label}
              </label>
            );
          }

          if (field.type === "textarea") {
            return (
              <AiField key={name} label={label} required={required}>
                <textarea
                  className={`${inputClassName()} min-h-[72px] w-full`}
                  value={val ?? ""}
                  required={required}
                  placeholder={field.placeholder ?? ""}
                  onChange={(e) => onChange(name, e.target.value)}
                />
              </AiField>
            );
          }

          const inputType =
            field.type === "number"
              ? "number"
              : field.type === "email"
                ? "email"
                : field.type === "date"
                  ? "date"
                  : field.type === "tel"
                    ? "tel"
                    : "text";

          return (
            <AiField key={name} label={label} required={required}>
              <input
                type={inputType}
                className={`${inputClassName()} w-full`}
                value={val ?? ""}
                required={required}
                step={field.type === "number" ? "any" : undefined}
                placeholder={field.placeholder ?? ""}
                onChange={(e) =>
                  onChange(
                    name,
                    field.type === "number" && e.target.value !== "" ? Number(e.target.value) : e.target.value,
                  )
                }
              />
              {field.hint ? <p className="mt-1 text-xs theme-text-muted">{field.hint}</p> : null}
            </AiField>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[var(--theme-border)] pt-3">
        <PrimaryButton type="submit" showIcon={false} disabled={loading} className="!text-xs !py-1.5 !px-3">
          {formSpec.submit_label ?? "Confirm & create"}
        </PrimaryButton>
        <button
          type="button"
          disabled={loading}
          onClick={onCancel}
          className="rounded-lg border border-[var(--theme-border)] px-3 py-1.5 text-xs theme-heading hover:bg-[var(--theme-hover)] disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
