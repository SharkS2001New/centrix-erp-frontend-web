"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";

const ACCEPT = "image/jpeg,image/png,image/webp,application/pdf,.doc,.docx";

export function ReturnProofField({ file, onChange, existingProof = null, disabled = false }) {
  return (
    <Field label="Attach proof (optional)">
      <input
        type="file"
        accept={ACCEPT}
        disabled={disabled}
        className={inputClassName()}
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <p className="mt-1 text-xs text-slate-500">
        Photo, PDF, or document — max 10 MB. Shown to approvers in notifications.
      </p>
      {file ? (
        <p className="mt-1 text-xs font-medium text-emerald-700">Selected: {file.name}</p>
      ) : existingProof?.file_name ? (
        <p className="mt-1 text-xs text-slate-600">Current file: {existingProof.file_name}</p>
      ) : null}
    </Field>
  );
}
