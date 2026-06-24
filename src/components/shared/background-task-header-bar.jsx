"use client";

import { useBackgroundTasksOptional } from "@/contexts/background-task-context";

function HeaderSpinner() {
  return (
    <div
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-[#185FA5]"
      aria-hidden="true"
    />
  );
}

/**
 * Compact background-task status in the header — only visible after "Run in background".
 */
export function BackgroundTaskHeaderBar() {
  const ctx = useBackgroundTasksOptional();
  const task = ctx?.activeTask;
  const minimized = Boolean(task && !ctx?.expanded);

  if (!ctx || !minimized) return null;

  const progress = Math.min(100, Math.max(0, Number(task.progress ?? 0)));
  const hasProgress = progress > 0;

  return (
    <div
      className="app-topbar-background-task flex min-w-0 flex-1 items-center gap-2 rounded-md border px-2.5 py-1.5 sm:max-w-md"
      aria-live="polite"
      aria-busy="true"
      title={task.message ?? task.label}
    >
      <HeaderSpinner />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-800">{task.label}</p>
        <p className="truncate text-[11px] text-slate-500">{task.message ?? "Working…"}</p>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-slate-200">
          {hasProgress ? (
            <div
              className="h-full rounded-full bg-[#185FA5] transition-all duration-300"
              style={{ width: `${Math.max(2, progress)}%` }}
            />
          ) : (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-[#185FA5]/70" />
          )}
        </div>
      </div>
      {hasProgress ? (
        <span className="shrink-0 text-xs font-medium tabular-nums text-slate-600">{Math.round(progress)}%</span>
      ) : null}
      <button
        type="button"
        onClick={ctx.expandActiveTask}
        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-[#185FA5] hover:bg-[#185FA5]/10"
        title="Reopen full progress view"
      >
        Expand
      </button>
      <button
        type="button"
        onClick={() => void ctx.cancelActiveTask()}
        className="shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium text-slate-500 hover:bg-slate-200/80 hover:text-slate-800"
      >
        Cancel
      </button>
    </div>
  );
}
