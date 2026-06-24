"use client";

import { createPortal } from "react-dom";

/**
 * Full-screen background task preloader (real server progress only).
 */
export function BackgroundTaskExpandedModal({ task, onMinimize, onCancel }) {
  if (!task || typeof document === "undefined") return null;

  const progress = Math.min(100, Math.max(0, Number(task.progress ?? 0)));
  const hasProgress = progress > 0;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[180] flex items-center justify-center p-4"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="pointer-events-auto w-full max-w-sm theme-panel rounded-xl border px-6 py-7 text-center shadow-2xl ring-1 ring-slate-900/5">
        <div
          className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#185FA5]"
          aria-hidden="true"
        />
        <p className="mt-4 text-sm font-semibold text-slate-900">{task.label}</p>
        <p className="mt-1 text-sm text-slate-600">{task.message ?? "Working…"}</p>
        <p className="mt-2 text-xs text-slate-500">
          You can keep working or open another page. Use Run in background to move progress to the header bar.
        </p>
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            {hasProgress ? (
              <div
                className="h-full rounded-full bg-[#185FA5] transition-all duration-300"
                style={{ width: `${Math.max(2, progress)}%` }}
              />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-[#185FA5]/70" />
            )}
          </div>
          {hasProgress ? (
            <p className="mt-1.5 text-xs text-slate-500">{Math.round(progress)}%</p>
          ) : (
            <p className="mt-1.5 text-xs text-slate-500">Waiting for server…</p>
          )}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={onMinimize}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Run in background
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline"
          >
            Cancel task
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
