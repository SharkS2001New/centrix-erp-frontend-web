"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  DOCUMENT_LOGO_POSITIONS,
  DOCUMENT_LOGO_SIZES,
  DOCUMENT_LOGO_VARIANTS,
  documentLogoFormKeys,
  normalizeDocumentLogoPosition,
  normalizeDocumentLogoSize,
} from "@/lib/document-logo-settings";

function Toggle({ checked, onChange, label, description }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

export function DocumentLogoSettingsFields({
  form,
  setForm,
  variantKey,
  description,
}) {
  const config = DOCUMENT_LOGO_VARIANTS[variantKey];
  const keys = documentLogoFormKeys(variantKey);
  if (!config) return null;

  const show = form?.[keys.show] !== false;
  const position = normalizeDocumentLogoPosition(
    form?.[keys.position] ?? config.defaultPosition,
    variantKey,
  );
  const size = normalizeDocumentLogoSize(form?.[keys.size] ?? config.defaultSize, variantKey);
  const positions = (config.positions ?? DOCUMENT_LOGO_POSITIONS.map((row) => row.id))
    .map((id) => DOCUMENT_LOGO_POSITIONS.find((row) => row.id === id))
    .filter(Boolean);
  const sizes = (config.sizes ?? DOCUMENT_LOGO_SIZES.map((row) => row.id))
    .map((id) => DOCUMENT_LOGO_SIZES.find((row) => row.id === id))
    .filter(Boolean);

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div>
        <p className="text-sm font-medium text-slate-900">Logo on this document</p>
        {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
      </div>
      <Toggle
        label="Show company logo"
        description="Uses your organization logo from Admin → Organization. Off hides the logo on this document only."
        checked={show}
        onChange={(v) => setForm((f) => ({ ...f, [keys.show]: v }))}
      />
      {show ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Logo position">
            <select
              className={inputClassName()}
              value={position}
              onChange={(e) => setForm((f) => ({ ...f, [keys.position]: e.target.value }))}
            >
              {positions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Logo size">
            <select
              className={inputClassName()}
              value={size}
              onChange={(e) => setForm((f) => ({ ...f, [keys.size]: e.target.value }))}
            >
              {sizes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
      ) : null}
    </div>
  );
}
