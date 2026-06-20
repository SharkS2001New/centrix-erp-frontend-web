"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export function ForgotPasswordHelpDialog({ open, onClose }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return undefined;
    function onKeyDown(e) {
      if (e.key === "Escape") onClose?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="forgot-password-help-title"
        className="auth-card w-full max-w-sm rounded-xl border p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="forgot-password-help-title" className="text-base font-semibold text-[var(--theme-text)]">
          Forgot your password?
        </h2>
        <p className="mt-3 text-sm theme-muted">
          Password resets are handled by your organization administrator. Ask them to set a new
          password for your account from <strong className="font-medium text-[var(--theme-text)]">Administration → Users</strong>.
        </p>
        <p className="mt-2 text-sm theme-muted">
          If you cannot reach your administrator, contact your platform support team.
        </p>
        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
          >
            Got it
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
