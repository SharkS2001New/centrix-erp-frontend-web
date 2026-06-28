"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Themed confirmation modal — replaces window.confirm for destructive actions.
 */
export function ConfirmDialog({
  open,
  title = "Confirm",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape" && !busy) onCancel();
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-black/40 p-4 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="theme-modal w-full max-w-md rounded-xl border p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="theme-heading text-base font-semibold">
          {title}
        </h2>
        <p id="confirm-dialog-message" className="theme-subtext mt-2 text-sm">
          {message}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="theme-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
              destructive
                ? "bg-red-600 hover:bg-red-700"
                : "theme-primary-btn"
            }`}
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
