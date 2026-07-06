"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { inputClassName } from "@/components/catalog/catalog-shared";

export function DiscountApprovalReasonDialog({
  open,
  onSubmit,
  onCancel,
  busy = false,
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const fieldId = useId();
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    setReason("");
    setError("");
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);

    function onKeyDown(event) {
      if (event.key === "Escape" && !busy) onCancel();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, busy, onCancel]);

  if (!open || typeof document === "undefined") return null;

  function handleSubmit(event) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < 3) {
      setError("Please enter at least 3 characters.");
      return;
    }
    onSubmit(trimmed);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="theme-modal w-full max-w-md rounded-xl border p-6 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldId}-title`}
        onClick={(event) => event.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="text-center">
          <h2 id={`${fieldId}-title`} className="theme-heading text-base font-semibold">
            Order discount approval
          </h2>
          <p className="theme-subtext mt-2 text-sm">
            Enter one reason for all discounts on this order. You will not be asked again for
            additional line discounts.
          </p>

          <div className="mt-5 text-left">
            <label htmlFor={`${fieldId}-reason`} className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">
              Reason <span className="text-red-600">*</span>
            </label>
            <textarea
              ref={inputRef}
              id={`${fieldId}-reason`}
              rows={4}
              value={reason}
              disabled={busy}
              required
              aria-required="true"
              placeholder="e.g. Customer loyalty, negotiated price…"
              className={`${inputClassName()} w-full resize-y`}
              onChange={(event) => {
                setReason(event.target.value);
                if (error) setError("");
              }}
            />
            {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
          </div>

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onCancel}
              className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="theme-primary-btn rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit reason"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
