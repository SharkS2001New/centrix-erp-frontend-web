"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import { formatPrintPhones } from "@/lib/document-print-phones";

function Toggle({ checked, onChange, label, description, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }`}
    >
      <input
        type="checkbox"
        className="mt-1"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? <span className="mt-0.5 block text-xs text-slate-500">{description}</span> : null}
      </span>
    </label>
  );
}

function SectionHeading({ title, description }) {
  return (
    <div>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {description ? <p className="mt-1 text-xs text-slate-500">{description}</p> : null}
    </div>
  );
}

/** Use company Tel 1/2, or set dedicated numbers for this document type. */
export function DocumentPrintPhonesFields({
  form,
  setForm,
  useSameKey,
  phonesKey,
  organization = null,
  title = "Phone numbers",
  description = "Company Tel 1 and Tel 2 from Admin → Company are the primary numbers on thermal receipts.",
}) {
  const companyLine = formatPrintPhones({
    tel1: organization?.primary_tel,
    tel2: organization?.secondary_tel,
  });
  const useSame = form[useSameKey] !== false;
  const phones = form[phonesKey] ?? { tel1: "", tel2: "" };

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
      <SectionHeading title={title} description={description} />
      {companyLine ? (
        <p className="text-xs text-slate-500">
          Company Tel 1 / Tel 2: <span className="font-medium text-slate-700">{companyLine}</span>
        </p>
      ) : (
        <p className="text-xs text-amber-700">
          Set Tel 1 / Tel 2 above — those primary numbers print on thermal receipts.
        </p>
      )}
      <Toggle
        label="Use same numbers as company Tel 1 & Tel 2"
        checked={useSame}
        onChange={(v) => setForm((f) => ({ ...f, [useSameKey]: v }))}
        description="When off, set different phone numbers for this document type only."
      />
      {!useSame ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tel 1">
            <input
              type="text"
              className={inputClassName()}
              value={phones.tel1 ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  [phonesKey]: { ...(f[phonesKey] ?? {}), tel1: e.target.value },
                }))
              }
              placeholder="Primary phone for this document"
            />
          </Field>
          <Field label="Tel 2">
            <input
              type="text"
              className={inputClassName()}
              value={phones.tel2 ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  [phonesKey]: { ...(f[phonesKey] ?? {}), tel2: e.target.value },
                }))
              }
              placeholder="Secondary phone (optional)"
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}
