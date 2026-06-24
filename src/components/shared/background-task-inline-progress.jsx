"use client";

import { useBackgroundTasksOptional } from "@/contexts/background-task-context";

/**
 * Compact progress indicator for minimized background tasks (e.g. beside a search field).
 */
export function BackgroundTaskInlineProgress({ className = "" }) {
  const backgroundTasks = useBackgroundTasksOptional();
  const task = backgroundTasks?.activeTask;
  const minimized = backgroundTasks?.overlayDismissed;

  if (!task || !minimized) return null;

  const progress = Math.min(100, Math.max(0, Number(task.progress ?? 0)));

  return (
    <div
      className={`min-w-[10rem] flex-1 ${className}`.trim()}
      aria-live="polite"
      aria-busy="true"
      title={task.message ?? task.label}
    >
      <div className="flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-[#185FA5] transition-all duration-300"
            style={{ width: `${Math.max(4, progress)}%` }}
          />
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-slate-600">{Math.round(progress)}%</span>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-slate-500">{task.message ?? task.label}</p>
    </div>
  );
}
