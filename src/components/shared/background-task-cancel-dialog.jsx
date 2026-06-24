"use client";

import { createPortal } from "react-dom";

export function BackgroundTaskCancelDialog({ open, taskLabel, onDismiss, onConfirm }) {
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[1px]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="background-cancel-dialog-title"
    >
      <div className="theme-panel w-full max-w-md rounded-xl border p-5 shadow-2xl">
        <h2 id="background-cancel-dialog-title" className="text-base font-semibold text-slate-900">
          Cancel background task?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {taskLabel ? (
            <>
              <span className="font-medium text-slate-800">{taskLabel}</span> is still running. Cancel it now?
            </>
          ) : (
            "This task is still running. Cancel it now?"
          )}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            No, continue
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Yes, cancel task
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
