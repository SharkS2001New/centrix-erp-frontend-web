"use client";

import { createPortal } from "react-dom";

export function BackgroundTaskNavDialog({ open, onStay, onCancelAndLeave }) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="background-nav-dialog-title"
    >
      <div className="theme-panel w-full max-w-md rounded-xl border p-5 shadow-2xl">
        <h2 id="background-nav-dialog-title" className="text-base font-semibold text-slate-900">
          Background task in progress
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          A report or export is still running. Do you want to cancel it and go to the other page?
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onStay}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            No, keep running
          </button>
          <button
            type="button"
            onClick={onCancelAndLeave}
            className="rounded-lg bg-[#185FA5] px-4 py-2 text-sm font-medium text-white hover:bg-[#134d88]"
          >
            Yes, cancel and leave
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
