"use client";

import { Field, inputClassName } from "@/components/catalog/catalog-shared";
import {
  RETURN_REASONS,
  RETURN_REASON_OTHER,
  resolveReturnReason,
} from "@/components/sales/customer-returns-shared";

/**
 * Standard return reason picker with optional free text when "Other" is selected.
 */
export function ReturnReasonFields({
  preset,
  otherText,
  onPresetChange,
  onOtherTextChange,
  label = "Reason for return",
  otherLabel = "Please specify",
  required = true,
  disabled = false,
  selectClassName = inputClassName(),
  otherClassName = inputClassName(),
}) {
  return (
    <>
      <Field label={label} required={required}>
        <select
          className={selectClassName}
          value={preset}
          onChange={(e) => onPresetChange(e.target.value)}
          required={required}
          disabled={disabled}
        >
          {RETURN_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </select>
      </Field>
      {preset === RETURN_REASON_OTHER ? (
        <Field label={otherLabel} required={required}>
          <input
            type="text"
            className={otherClassName}
            value={otherText}
            onChange={(e) => onOtherTextChange(e.target.value)}
            placeholder="Describe the reason for return"
            minLength={3}
            required={required}
            disabled={disabled}
            autoComplete="off"
          />
        </Field>
      ) : null}
    </>
  );
}

export function isReturnReasonValid(preset, otherText) {
  return resolveReturnReason(preset, otherText).trim().length >= 3;
}
