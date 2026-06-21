"use client";

import { createPortal } from "react-dom";

/**
 * Full-screen preloader shown while a queued background task is running.
 */
export function QueuedTaskOverlay({ open, message = "Please wait…", progress = null }) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-busy="true"
      aria-live="polite"
      aria-label={message}
    >
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white px-6 py-8 text-center shadow-2xl">
        <div
          className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#185FA5]"
          aria-hidden="true"
        />
        <p className="mt-4 text-sm font-medium text-slate-900">{message}</p>
        <p className="mt-1 text-xs text-slate-500">Do not close this window until processing finishes.</p>
        {progress != null && Number(progress) > 0 ? (
          <div className="mt-4">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#185FA5] transition-all duration-300"
                style={{ width: `${Math.min(100, Math.max(0, Number(progress)))}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-slate-500">{Math.round(Number(progress))}%</p>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
