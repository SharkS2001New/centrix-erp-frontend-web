"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBackgroundTasksOptional } from "@/contexts/background-task-context";

/**
 * Centered preloader for report/data screens — spinner and status text only (no fake progress).
 */
export function ReportLoadingOverlay({
  loading,
  title = "Loading report…",
  subtitle = "Fetching data…",
}) {
  const backgroundTasks = useBackgroundTasksOptional();
  const [visible, setVisible] = useState(false);
  const wasLoadingRef = useRef(false);

  useEffect(() => {
    if (loading) {
      wasLoadingRef.current = true;
      setVisible(true);
      return undefined;
    }

    if (!wasLoadingRef.current) {
      return undefined;
    }

    wasLoadingRef.current = false;
    const doneTimer = setTimeout(() => setVisible(false), 200);
    return () => clearTimeout(doneTimer);
  }, [loading]);

  if (backgroundTasks?.busy) return null;
  if (!visible || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0 z-[170] flex items-center justify-center p-4"
      aria-live="polite"
      aria-busy={loading ? "true" : "false"}
    >
      <div className="pointer-events-auto w-full max-w-sm theme-panel rounded-xl border px-6 py-7 text-center shadow-2xl ring-1 ring-slate-900/5">
        <div
          className="mx-auto h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#185FA5]"
          aria-hidden="true"
        />
        <p className="mt-4 text-sm font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm text-slate-600">{loading ? subtitle : "Done"}</p>
      </div>
    </div>,
    document.body,
  );
}
