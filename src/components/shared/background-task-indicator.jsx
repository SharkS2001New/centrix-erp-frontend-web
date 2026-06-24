"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

function useDisplayProgress(task) {
  const [simulated, setSimulated] = useState(0);
  const serverProgress = Number(task?.progress ?? 0);

  useEffect(() => {
    if (!task) {
      setSimulated(0);
      return undefined;
    }

    setSimulated((current) => Math.max(current, 6, serverProgress));

    const timer = setInterval(() => {
      setSimulated((current) => {
        const floor = Math.max(current, serverProgress);
        if (floor >= 92) {
          return floor;
        }
        const step = floor < 40 ? 6 : floor < 70 ? 3 : 1;
        return Math.min(92, floor + step);
      });
    }, 450);

    return () => clearInterval(timer);
  }, [task?.id, serverProgress]);

  return Math.min(100, Math.max(simulated, serverProgress));
}

/**
 * Page-centered background task indicator. Can be minimized so work continues with an inline bar.
 */
export function BackgroundTaskIndicator({ task, onCancel, onMinimize }) {
  const progress = useDisplayProgress(task);

  if (!task || typeof document === "undefined") return null;

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
        <p className="mt-1 text-sm text-slate-600">{task.message}</p>
        <p className="mt-2 text-xs text-slate-500">
          You can keep working or open another page. Leaving will ask whether to cancel this task.
        </p>
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#185FA5] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(4, progress))}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-500">{Math.round(progress)}%</p>
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
