"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  EMPTY_RECEIPT_PAYMENT_DETAILS,
  normalizeReceiptPaymentDetails,
} from "@/lib/receipt-payment-details";

function updateLine(lines, index, key, value) {
  return lines.map((line, i) => (i === index ? { ...line, [key]: value } : line));
}

export function ReceiptPaymentDetailsEditor({
  value,
  onChange,
  idPrefix = "pay",
  description = "Shown on printed receipts and invoices. Leave blank to hide this block.",
}) {
  const details = normalizeReceiptPaymentDetails(value ?? EMPTY_RECEIPT_PAYMENT_DETAILS);

  function patch(patch) {
    onChange(normalizeReceiptPaymentDetails({ ...details, ...patch }));
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
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-slate-500">Payment lines</span>
          <button
            type="button"
            className="text-xs font-medium text-[#185FA5] hover:underline disabled:opacity-40"
            disabled={details.lines.length >= 12}
            onClick={() => patch({ lines: [...details.lines, { label: "", value: "" }] })}
          >
            Add line
          </button>
        </div>
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
                placeholder="Value e.g. 123456"
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
