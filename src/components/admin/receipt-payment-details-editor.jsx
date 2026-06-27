"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  EMPTY_RECEIPT_PAYMENT_DETAILS,
  normalizeReceiptPaymentDetails,
} from "@/lib/receipt-payment-details";

const PAYMENT_LINE_PRESETS = [
  {
    id: "paybill",
    label: "M-Pesa Paybill",
    lines: [
      { label: "M-Pesa Paybill", value: "" },
      { label: "Account no.", value: "" },
    ],
  },
  {
    id: "till",
    label: "Till number",
    lines: [{ label: "Till no.", value: "" }],
  },
  {
    id: "bank",
    label: "Bank account",
    lines: [
      { label: "Bank", value: "" },
      { label: "Account no.", value: "" },
      { label: "Branch", value: "" },
    ],
  },
];

function updateLine(lines, index, key, value) {
  return lines.map((line, i) => (i === index ? { ...line, [key]: value } : line));
}

function mergePresetLines(existingLines, presetLines) {
  const current = normalizeReceiptPaymentDetails({
    ...EMPTY_RECEIPT_PAYMENT_DETAILS,
    lines: existingLines,
  }).lines.filter((line) => line.label || line.value);

  const merged = [...current];
  for (const line of presetLines) {
    const duplicate = merged.some(
      (entry) => entry.label.toLowerCase() === line.label.toLowerCase(),
    );
    if (!duplicate) merged.push({ ...line });
  }
  return merged.length ? merged : [{ label: "", value: "" }];
}

export function ReceiptPaymentDetailsEditor({
  value,
  onChange,
  idPrefix = "pay",
  description = "Each row is one printed line: label on the left, value on the right. For Paybill, add two rows — one for the paybill number and one for the account number.",
}) {
  const details = normalizeReceiptPaymentDetails(value ?? EMPTY_RECEIPT_PAYMENT_DETAILS);

  function patch(patch) {
    onChange(normalizeReceiptPaymentDetails({ ...details, ...patch }));
  }

  function applyPreset(preset) {
    patch({ lines: mergePresetLines(details.lines, preset.lines) });
  }

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4">
      {description ? <p className="text-xs text-slate-600">{description}</p> : null}
      <Field label="Section title">
        <input
          type="text"
          className={inputClassName()}
          value={details.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder="Payment details"
        />
      </Field>
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Payment lines</span>
          <div className="flex flex-wrap items-center gap-2">
            {PAYMENT_LINE_PRESETS.map((preset) => (
              <button
                key={`${idPrefix}-preset-${preset.id}`}
                type="button"
                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100"
                onClick={() => applyPreset(preset)}
              >
                + {preset.label}
              </button>
            ))}
            <button
              type="button"
              className="text-xs font-medium text-[#185FA5] hover:underline disabled:opacity-40"
              disabled={details.lines.length >= 12}
              onClick={() => patch({ lines: [...details.lines, { label: "", value: "" }] })}
            >
              Add line
            </button>
          </div>
        </div>
        <p className="mb-2 text-[11px] text-slate-500">
          Example Paybill setup: row 1 = <strong>M-Pesa Paybill</strong> / <strong>400200</strong>,
          row 2 = <strong>Account no.</strong> / <strong>your account</strong>.
        </p>
        <div className="space-y-2">
          {details.lines.map((line, index) => (
            <div key={`${idPrefix}-line-${index}`} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input
                type="text"
                className={inputClassName()}
                value={line.label}
                onChange={(e) => patch({ lines: updateLine(details.lines, index, "label", e.target.value) })}
                placeholder="Label e.g. M-Pesa Paybill"
              />
              <input
                type="text"
                className={inputClassName()}
                value={line.value}
                onChange={(e) => patch({ lines: updateLine(details.lines, index, "value", e.target.value) })}
                placeholder="Value e.g. 400200"
              />
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-600 hover:bg-white disabled:opacity-40"
                disabled={details.lines.length <= 1}
                onClick={() =>
                  patch({
                    lines:
                      details.lines.length <= 1
                        ? [{ label: "", value: "" }]
                        : details.lines.filter((_, i) => i !== index),
                  })
                }
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
      <Field label="Note (optional)">
        <textarea
          className={`${inputClassName()} min-h-[72px]`}
          value={details.note}
          onChange={(e) => patch({ note: e.target.value })}
          placeholder="e.g. Quote your receipt number as the account reference."
        />
      </Field>
    </div>
  );
}
